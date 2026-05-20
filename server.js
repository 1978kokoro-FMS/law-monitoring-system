// 법령 모니터링 시스템 - 독립 서버
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const LAW_API_KEY  = process.env.LAW_API_KEY  || 'uuc_7326';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qiwqcylerloqxdqupgbk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpd3FjeWxlcmxvcXhkcXVwZ2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0MTQxMzMsImV4cCI6MjA3NDk5MDEzM30.haR8oLJsgp_5r-EisNqxI8ASHrdh87hiAixfMt5TG6U';

app.use(cors());
app.use(express.json());

// ─── API 라우트 (정적 파일보다 먼저) ───────────────────────────

// 법령 검색
app.get('/api/law/search', async (req, res) => {
    try {
        const { query, target = 'law' } = req.query;
        if (!query) return res.status(400).json({ error: '검색어를 입력해주세요.' });
        const response = await axios.get('https://www.law.go.kr/DRF/lawSearch.do', {
            params: { OC: LAW_API_KEY, target, type: 'XML', query }
        });
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(response.data);
    } catch(e) {
        res.status(500).json({ error: '법령 검색 오류', details: e.message });
    }
});

// 법령 상세
app.get('/api/law/detail/:serialNo', async (req, res) => {
    try {
        const response = await axios.get('https://www.law.go.kr/DRF/lawService.do', {
            params: { OC: LAW_API_KEY, target: 'law', type: 'XML', MST: req.params.serialNo }
        });
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(response.data);
    } catch(e) {
        res.status(500).json({ error: '법령 상세 조회 오류', details: e.message });
    }
});

// 변경사항 배치 수집
app.post('/api/batch/collect-changes', async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const results  = { total: 0, new: 0, updated: 0, scannedDates: 0, matchedLaws: [] };

        const { data: laws } = await supabase.from('laws').select('*');

        const today = new Date();
        const oneYearAgo = new Date(today); oneYearAgo.setFullYear(today.getFullYear() - 1);
        const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'');
        const startStr = req.body?.startDate || fmt(oneYearAgo);
        const endStr   = req.body?.endDate   || fmt(today);

        const dates = [];
        const cur = new Date(startStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
        const end = new Date(endStr.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
        while (cur <= end) {
            if (cur.getDay() !== 0 && cur.getDay() !== 6) dates.push(fmt(new Date(cur)));
            cur.setDate(cur.getDate() + 1);
        }

        for (const dateStr of dates) {
            try {
                results.scannedDates++;
                const searchRes = await axios.get('https://www.law.go.kr/DRF/lawSearch.do', {
                    params: { OC: LAW_API_KEY, target: 'lsHstInf', type: 'XML', regDt: dateStr, display: 100 },
                    timeout: 10000
                });
                const lawNodes = searchRes.data.match(/<law[^>]*>[\s\S]*?<\/law>/g) || [];

                for (const lawXml of lawNodes) {
                    const g   = tag => lawXml.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1] || '';
                    const raw = lawXml.match(/<법령명한글>([\s\S]*?)<\/법령명한글>/)?.[1] || '';
                    const lawName = raw.replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'').trim();
                    const matched = (laws || []).find(l => l.law_name === lawName);
                    if (!matched) continue;

                    const serialNo = g('법령일련번호'), promDate = g('공포일자');
                    const changeType = g('제개정구분명'), ministry = g('소관부처명');
                    const enforcementDate = g('시행일자');
                    const isOtherLaw = g('자법타법여부') === '타법' || changeType.includes('타법');
                    if (!promDate) continue;

                    let revisionReason = '';
                    if (serialNo) {
                        try {
                            const det = await axios.get('https://www.law.go.kr/DRF/lawService.do', {
                                params: { OC: LAW_API_KEY, target: 'law', type: 'XML', MST: serialNo }, timeout: 15000
                            });
                            const raw2 = det.data.match(/<제개정이유>([\s\S]*?)<\/제개정이유>/)?.[1] || '';
                            revisionReason = raw2.replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'').replace(/<[^>]+>/g,'').trim();
                            await new Promise(r => setTimeout(r, 300));
                        } catch(e) {}
                    }

                    const { data: existing } = await supabase.from('law_changes').select('id')
                        .eq('law_id', matched.law_id).eq('change_date', promDate).single();

                    if (existing) {
                        await supabase.from('law_changes').update({ serial_no: serialNo, change_type: changeType, enforcement_date: enforcementDate, is_other_law: isOtherLaw, revision_reason: revisionReason }).eq('id', existing.id);
                        results.updated++;
                    } else {
                        await supabase.from('law_changes').insert({ law_id: matched.law_id, serial_no: serialNo, change_date: promDate, change_type: changeType, law_name: lawName, ministry: ministry || matched.ministry, enforcement_date: enforcementDate, is_other_law: isOtherLaw, revision_reason: revisionReason });
                        results.new++;
                        results.matchedLaws.push(`${lawName}(${promDate})`);
                    }
                    results.total++;
                }
                await new Promise(r => setTimeout(r, 200));
            } catch(e) {}
        }
        res.json({ success: true, results });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// 시행일 업데이트
app.post('/api/batch/update-enforcement-dates', async (req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data: changes } = await supabase.from('law_changes').select('id, serial_no, law_name').is('enforcement_date', null);
        let updated = 0, errors = [];
        for (const ch of changes || []) {
            if (!ch.serial_no) continue;
            try {
                const r = await axios.get('https://www.law.go.kr/DRF/lawService.do', {
                    params: { OC: LAW_API_KEY, target: 'law', type: 'XML', MST: ch.serial_no }, timeout: 15000
                });
                const enfDate = r.data.match(/<시행일자>(.*?)<\/시행일자>/)?.[1];
                const isOther = (r.data.match(/<제개정구분명>(.*?)<\/제개정구분명>/)?.[1] || '').includes('타법');
                if (enfDate) {
                    await supabase.from('law_changes').update({ enforcement_date: enfDate, is_other_law: isOther }).eq('id', ch.id);
                    updated++;
                }
                await new Promise(r => setTimeout(r, 500));
            } catch(e) { errors.push(ch.law_name); }
        }
        res.json({ success: true, updated, errors });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── 정적 파일 서빙 ────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`✅ 법령모니터링 서버 실행: http://localhost:${PORT}`));

// ═══════════════════════════════════════════════
// 법령 모니터링 시스템 - 메인 앱
// ═══════════════════════════════════════════════

// Supabase 초기화
var supabase = window.supabaseClient || (window.supabaseClient = window.supabase.createClient(
    CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY
));

// 현재 활성 탭
let currentTab = 'dashboard';

// ── 유틸리티 ──────────────────────────────────
const utils = {
    showLoading: () => document.getElementById('loadingOverlay').classList.add('show'),
    hideLoading: () => document.getElementById('loadingOverlay').classList.remove('show'),

    toast: (msg, type = 'info') => {
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2800);
    },

    formatDate: (str) => {
        if (!str) return '-';
        if (str.length === 8) return `${str.substring(0,4)}.${str.substring(4,6)}.${str.substring(6,8)}`;
        return str.substring(0, 10).replace(/-/g, '.');
    },

    escapeHtml: (s) => {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    },

    getCurrentQuarter: () => {
        const now = new Date();
        return { year: now.getFullYear(), quarter: Math.ceil((now.getMonth() + 1) / 3) };
    },

    getQuarterRange: (year, quarter) => {
        const ranges = { 1: '1월~3월', 2: '4월~6월', 3: '7월~9월', 4: '10월~12월' };
        return `${year}년 ${ranges[quarter]}`;
    }
};

// ── 탭 전환 ──────────────────────────────────
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tab).classList.add('active');
            currentTab = tab;
            loadTabData(tab);
        });
    });
}

function loadTabData(tab) {
    switch (tab) {
        case 'dashboard':   loadDashboard();    break;
        case 'laws':        loadMonitoringLaws(); break;
        case 'inspection':  loadInspections();  break;
        case 'report':      loadReportList();   break;
        case 'admin':       loadAdminStats();   break;
    }
}

function refreshCurrentTab() { loadTabData(currentTab); }

function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// 보고서 탭으로 이동 (현재 점검 기준)
function goToReportTab() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="report"]').classList.add('active');
    document.getElementById('report').classList.add('active');
    currentTab = 'report';
    loadReportList();
}

// ── 대시보드 ──────────────────────────────────
async function loadDashboard() {
    // 현재 분기 표시
    const { year, quarter } = utils.getCurrentQuarter();
    document.getElementById('currentQuarterBadge').textContent = `${year}년 ${quarter}분기`;

    // 법령 수
    try {
        const { count } = await supabase.from('laws').select('*', { count: 'exact', head: true });
        document.getElementById('stat-laws').textContent = count || 0;
        const cnt = count || 0;
        document.getElementById('dash-law-count').textContent = `(${cnt}건)`;
    } catch(e) {}

    // 전체 점검 횟수
    try {
        const { count } = await supabase.from('quarterly_inspections').select('*', { count: 'exact', head: true });
        document.getElementById('stat-total-inspections').textContent = count || 0;
    } catch(e) {}

    // 이번 분기 점검 현황
    try {
        const { data: thisQ } = await supabase
            .from('quarterly_inspections')
            .select('*')
            .eq('year', year)
            .eq('quarter', quarter)
            .limit(1)
            .single();

        if (thisQ) {
            const { data: items } = await supabase
                .from('inspection_items')
                .select('is_completed')
                .eq('inspection_id', thisQ.id);
            const total = items?.length || 0;
            const done = items?.filter(i => i.is_completed).length || 0;
            document.getElementById('stat-inspection').textContent = `${done}/${total}`;
            document.getElementById('stat-inspection-sub').textContent = thisQ.status === 'COMPLETED' ? '✅ 점검 완료' : '진행 중';
        } else {
            document.getElementById('stat-inspection').textContent = '-';
            document.getElementById('stat-inspection-sub').textContent = '점검 미시작';
        }
    } catch(e) {
        document.getElementById('stat-inspection').textContent = '-';
        document.getElementById('stat-inspection-sub').textContent = '점검 미시작';
    }

    // 미완료 조치사항
    try {
        const { count } = await supabase
            .from('inspection_items')
            .select('*', { count: 'exact', head: true })
            .eq('action_required', true)
            .eq('is_completed', false);
        document.getElementById('stat-pending').textContent = count || 0;
    } catch(e) {}

    // 최근 분기점검 목록
    try {
        const { data: inspections } = await supabase
            .from('quarterly_inspections')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        const el = document.getElementById('dash-recent-inspections');
        if (inspections && inspections.length > 0) {
            el.innerHTML = inspections.map(ins => `
                <div style="padding:12px;border:1.5px solid var(--gray-200);border-radius:8px;margin-bottom:8px;cursor:pointer"
                     onclick="openInspectionById(${ins.id})">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <strong>${ins.year}년 ${ins.quarter}분기 점검</strong>
                        <span class="badge ${ins.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}">
                            ${ins.status === 'COMPLETED' ? '완료' : '진행중'}
                        </span>
                    </div>
                    <div style="font-size:0.8rem;color:var(--gray-500);margin-top:4px">
                        ${ins.created_by || '작성자 미지정'} · ${utils.formatDate(ins.created_at)}
                    </div>
                </div>
            `).join('');
        } else {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>점검 이력이 없습니다</p></div>';
        }
    } catch(e) {}

    // 미완료 조치사항 목록
    try {
        const { data: pending } = await supabase
            .from('inspection_items')
            .select('*, quarterly_inspections(year, quarter)')
            .eq('action_required', true)
            .eq('is_completed', false)
            .limit(5);

        const el = document.getElementById('dash-pending-actions');
        if (pending && pending.length > 0) {
            el.innerHTML = pending.map(item => `
                <div style="padding:10px;border-left:3px solid var(--warning);background:#fffbeb;border-radius:6px;margin-bottom:8px">
                    <div style="font-weight:600;font-size:0.875rem">${utils.escapeHtml(item.law_name)}</div>
                    <div style="font-size:0.8rem;color:var(--gray-500);margin-top:3px">
                        담당: ${item.assignee || '미지정'} · 
                        ${item.quarterly_inspections ? item.quarterly_inspections.year + '년 ' + item.quarterly_inspections.quarter + '분기' : ''}
                    </div>
                </div>
            `).join('');
        } else {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>미완료 조치사항이 없습니다</p></div>';
        }
    } catch(e) {}

    // 모니터링 법령 목록 (대시보드)
    try {
        const { data: laws } = await supabase.from('laws').select('*').order('law_name');
        const el = document.getElementById('dash-laws-list');
        if (laws && laws.length > 0) {
            el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px">` +
                laws.map(l => `
                    <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:8px 14px;font-size:0.85rem">
                        <strong>${utils.escapeHtml(l.law_name)}</strong>
                        <span style="color:var(--gray-500);font-size:0.75rem;margin-left:6px">${l.ministry || ''}</span>
                    </div>
                `).join('') + `</div>`;
        } else {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚖️</div><p>등록된 법령이 없습니다</p></div>';
        }
    } catch(e) {}
}

// ── 모니터링 법령 관리 ──────────────────────────
async function searchLawAPI() {
    const keyword = document.getElementById('lawSearchInput').value.trim();
    if (!keyword) { utils.toast('검색어를 입력하세요', 'error'); return; }

    utils.showLoading();
    const container = document.getElementById('lawSearchResults');
    container.innerHTML = '<p style="color:var(--gray-500);padding:12px">검색 중...</p>';

    try {
        const target = document.getElementById('lawSearchTarget')?.value || 'law';
        const res = await fetch(`/api/law/search?query=${encodeURIComponent(keyword)}&target=${target}`);
        if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
        const xml = await res.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const laws = Array.from(doc.getElementsByTagName('law')).map(el => {
            const get = (tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
            return {
                law_id:       get('법령ID'),
                law_name:     get('법령명한글'),
                law_type:     get('법령구분명'),
                ministry:     get('소관부처명'),
                enacted_date: get('공포일자'),
                serial_no:    get('법령일련번호'),
            };
        });

        if (laws.length === 0) {
            container.innerHTML = '<p style="color:var(--gray-500);padding:12px">검색 결과가 없습니다.</p>';
            return;
        }

        container.innerHTML = `
            <div style="margin-top:12px;font-size:0.85rem;color:var(--gray-500);margin-bottom:8px">${laws.length}건 검색됨</div>
            ${laws.map((l) => `
                <div class="law-item">
                    <div class="law-item-info">
                        <h4>${utils.escapeHtml(l.law_name)}</h4>
                        <p>${l.ministry || '-'} · ${l.law_type || '-'} · 공포일: ${utils.formatDate(l.enacted_date)}</p>
                    </div>
                    <div class="law-item-actions">
                        <button onclick='addToMonitoring(${JSON.stringify(l).replace(/'/g,"&apos;")})' class="btn btn-success btn-sm">➕ 추가</button>
                    </div>
                </div>
            `).join('')}`;

    } catch(e) {
        container.innerHTML = `
            <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:14px;margin-top:12px">
                <p style="color:var(--danger);font-weight:600;margin-bottom:8px">🚫 검색 연결 실패</p>
                <p style="font-size:0.83rem;color:#7f1d1d;margin-bottom:12px">외부 네트워크 문제로 일시적으로 검색이 되지 않습니다.<br>✅ 직접 추가 버튼으로 수동 등록하실 수 있습니다.</p>
                <button onclick="openAddLawModal()" class="btn btn-success btn-sm">✏️ 직접 추가하기</button>
            </div>`;
    } finally {
        utils.hideLoading();
    }
}

async function addToMonitoring(law) {
    try {
        // 중복 체크
        const { data: exists } = await supabase.from('laws').select('id').eq('law_id', law.law_id).single();
        if (exists) { utils.toast('이미 모니터링 중인 법령입니다', 'error'); return; }

        const { error } = await supabase.from('laws').insert({
            law_id: law.law_id,
            law_name: law.law_name,
            law_type: law.law_type,
            ministry: law.ministry,
            enacted_date: law.enacted_date,
            serial_no: law.serial_no,
            is_active: true
        });
        if (error) throw error;
        utils.toast(`"${law.law_name}" 모니터링에 추가되었습니다`, 'success');
        loadMonitoringLaws();
    } catch(e) {
        utils.toast('추가 실패: ' + e.message, 'error');
    }
}

async function loadMonitoringLaws() {
    try {
        const { data: laws, error } = await supabase.from('laws').select('*').order('law_name');
        if (error) throw error;

        document.getElementById('monitoring-count').textContent = `${laws?.length || 0}건`;
        const el = document.getElementById('monitoringLawsList');

        if (laws && laws.length > 0) {
            el.innerHTML = laws.map(l => `
                <div class="law-item">
                    <div class="law-item-info">
                        <h4>${utils.escapeHtml(l.law_name)}</h4>
                        <p>${l.ministry || '-'} · ${l.law_type || '-'} · 법령ID: ${l.law_id}</p>
                    </div>
                    <div class="law-item-actions">
                        <a href="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${l.serial_no}" target="_blank" class="btn btn-secondary btn-sm">📖 법제처</a>
                        <button onclick="removeLaw('${l.law_id}', '${utils.escapeHtml(l.law_name)}')" class="btn btn-danger btn-sm">🗑️ 삭제</button>
                    </div>
                </div>
            `).join('');
        } else {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚖️</div><p>등록된 법령이 없습니다.<br>위에서 검색하여 추가하세요.</p></div>';
        }
    } catch(e) {
        utils.toast('목록 로드 실패: ' + e.message, 'error');
    }
}

function openAddLawModal() {
    // 입력 초기화
    ['addLawName','addLawMinistry','addLawId','addLawSerial'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const typeEl = document.getElementById('addLawType');
    if (typeEl) typeEl.value = '법률';
    document.getElementById('addLawModal').classList.add('show');
}

async function addLawDirectly() {
    const lawName = document.getElementById('addLawName').value.trim();
    if (!lawName) { utils.toast('법령명을 입력하세요', 'error'); return; }

    const ministry  = document.getElementById('addLawMinistry').value.trim();
    const lawType   = document.getElementById('addLawType').value;
    const lawIdInput = document.getElementById('addLawId').value.trim();
    const serialNo  = document.getElementById('addLawSerial').value.trim();

    // law_id: 입력값 있으면 사용, 없으면 법령명 기반으로 생성
    const lawId = lawIdInput || ('manual_' + lawName.replace(/\s/g,'') + '_' + Date.now());

    try {
        // 중복 체크 (법령명 기준)
        const { data: existsByName } = await supabase.from('laws').select('id').eq('law_name', lawName);
        if (existsByName && existsByName.length > 0) {
            utils.toast('동일한 법령명이 이미 등록되어 있습니다', 'error');
            return;
        }

        const { error } = await supabase.from('laws').insert({
            law_id:       lawId,
            law_name:     lawName,
            law_type:     lawType,
            ministry:     ministry || null,
            enacted_date: null,
            serial_no:    serialNo || null,
            is_active:    true
        });
        if (error) throw error;

        utils.toast(`"${lawName}" 추가되었습니다`, 'success');
        closeModal('addLawModal');
        loadMonitoringLaws();
    } catch(e) {
        utils.toast('추가 실패: ' + e.message, 'error');
    }
}

async function removeLaw(lawId, lawName) {
    if (!confirm(`"${lawName}"을 모니터링에서 삭제하시겠습니까?`)) return;
    try {
        const { error } = await supabase.from('laws').delete().eq('law_id', lawId);
        if (error) throw error;
        utils.toast('삭제되었습니다', 'success');
        loadMonitoringLaws();
    } catch(e) {
        utils.toast('삭제 실패: ' + e.message, 'error');
    }
}

// ── 관리 탭 통계 ──────────────────────────────
async function loadAdminStats() {
    try {
        const [l, c, i] = await Promise.allSettled([
            supabase.from('laws').select('*', { count: 'exact', head: true }),
            supabase.from('law_changes').select('*', { count: 'exact', head: true }),
            supabase.from('quarterly_inspections').select('*', { count: 'exact', head: true })
        ]);
        document.getElementById('admin-stat-laws').textContent = l.value?.count || 0;
        document.getElementById('admin-stat-changes').textContent = c.value?.count || 0;
        document.getElementById('admin-stat-inspections').textContent = i.value?.count || 0;
    } catch(e) {}

    // 날짜 기본값 설정 (오늘 ~ 1년 전)
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const fmt = d => d.toISOString().slice(0, 10);
    const startEl = document.getElementById('batchStartDate');
    const endEl   = document.getElementById('batchEndDate');
    if (startEl && !startEl.value) startEl.value = fmt(oneYearAgo);
    if (endEl   && !endEl.value)   endEl.value   = fmt(today);
}

// 점검 탭에서 특정 점검 직접 열기 (대시보드에서 클릭)
async function openInspectionById(id) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="inspection"]').classList.add('active');
    document.getElementById('inspection').classList.add('active');
    currentTab = 'inspection';
    await loadInspections();
    await openInspectionDetail(id);
}

// ── 앱 초기화 ──────────────────────────────────
async function initApp() {
    // 현재 분기 배지
    const { year, quarter } = utils.getCurrentQuarter();
    document.getElementById('currentQuarterBadge').textContent = `${year}년 ${quarter}분기`;

    initTabs();
    await loadDashboard();
}

document.addEventListener('DOMContentLoaded', initApp);

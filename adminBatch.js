// ═══════════════════════════════════════════════════════════════
// 관리 탭 - 법령 변경사항 배치 수집
// ═══════════════════════════════════════════════════════════════

async function collectLawChanges() {
    const btn       = document.getElementById('collectChangesBtn');
    const statusDiv = document.getElementById('batchStatus');
    const resultDiv = document.getElementById('batchResult');

    const startDate = document.getElementById('batchStartDate')?.value?.replace(/-/g,'');
    const endDate   = document.getElementById('batchEndDate')?.value?.replace(/-/g,'');

    btn.disabled = true;
    btn.textContent = '⏳ 수집 중... (수분 소요)';
    statusDiv.style.display = 'block';
    resultDiv.style.display = 'none';

    try {
        const response = await fetch('/api/batch/collect-changes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();

        statusDiv.style.display = 'none';
        resultDiv.style.display = 'block';

        if (result.success) {
            const r = result.results;
            resultDiv.style.cssText = 'background:#dcfce7;border-left:4px solid #16a34a;padding:16px;border-radius:8px;';
            resultDiv.innerHTML = `
                <p style="font-weight:700;font-size:1rem;margin-bottom:12px;color:#166534">✅ 수집 완료!</p>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:white;padding:14px;border-radius:8px;margin-bottom:12px">
                    <div style="text-align:center">
                        <div style="font-size:0.8rem;color:#64748b">스캔 날짜</div>
                        <div style="font-size:1.8rem;font-weight:800;color:#6366f1">${r.scannedDates}</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:0.8rem;color:#64748b">신규 추가</div>
                        <div style="font-size:1.8rem;font-weight:800;color:#16a34a">${r.new}</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:0.8rem;color:#64748b">업데이트</div>
                        <div style="font-size:1.8rem;font-weight:800;color:#d97706">${r.updated}</div>
                    </div>
                </div>
                ${r.matchedLaws?.length > 0 ? `
                <div style="background:white;padding:12px;border-radius:8px;font-size:0.85rem;margin-bottom:12px">
                    <p style="font-weight:600;color:#4f46e5;margin-bottom:6px">🎯 수집된 법령:</p>
                    ${r.matchedLaws.map(l => `<div>· ${l}</div>`).join('')}
                </div>` : '<p style="color:#64748b;font-size:0.85rem;margin-bottom:8px">해당 기간 변경된 모니터링 법령 없음</p>'}
                <p style="font-size:0.85rem;color:#475569">💡 분기점검 탭 → <strong>"🔄 변경사항 새로고침"</strong> 클릭하세요.</p>`;
            loadAdminStats();
        } else {
            throw new Error(result.error || '수집 실패');
        }
    } catch(e) {
        statusDiv.style.display = 'none';
        resultDiv.style.display = 'block';
        resultDiv.style.cssText = 'background:#fee2e2;border-left:4px solid #dc2626;padding:16px;border-radius:8px;';
        resultDiv.innerHTML = `<p style="font-weight:700;color:#991b1b;margin-bottom:8px">❌ 오류</p><p style="color:#7f1d1d">${e.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔄 변경사항 수집 실행';
    }
}

async function updateEnforcementDates() {
    const btn       = document.getElementById('enforcementBtn');
    const statusDiv = document.getElementById('enforcementStatus');
    const resultDiv = document.getElementById('enforcementResult');

    btn.disabled = true;
    btn.textContent = '⏳ 업데이트 중...';
    statusDiv.style.display = 'block';
    resultDiv.style.display = 'none';

    try {
        const response = await fetch('/api/batch/update-enforcement-dates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();

        statusDiv.style.display = 'none';
        resultDiv.style.display = 'block';
        resultDiv.style.cssText = 'background:#dcfce7;border-left:4px solid #16a34a;padding:16px;border-radius:8px;';
        resultDiv.innerHTML = `
            <p style="font-weight:700;color:#166534;margin-bottom:8px">✅ 완료!</p>
            <p>시행일 업데이트: <strong>${result.updated}건</strong></p>
            <p style="color:#64748b;font-size:0.85rem;margin-top:8px">💡 분기점검 탭 → "변경사항 새로고침" 클릭하세요.</p>`;
    } catch(e) {
        statusDiv.style.display = 'none';
        resultDiv.style.display = 'block';
        resultDiv.style.cssText = 'background:#fee2e2;padding:16px;border-radius:8px;';
        resultDiv.innerHTML = `<p style="color:#991b1b;">❌ 오류: ${e.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '🗓️ 시행일 업데이트';
    }
}

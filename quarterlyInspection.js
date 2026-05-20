// ═══════════════════════════════════════════════
// 분기점검 관리 + 보고서 생성
// ═══════════════════════════════════════════════

let currentInspectionId = null;
let currentInspectionData = null;

// 분기 날짜 범위 계산 (change_date가 YYYYMMDD 형식)
function getQuarterDateRange(year, quarter) {
    const ranges = {
        1: { start: `${year}0101`, end: `${year}0331` },
        2: { start: `${year}0401`, end: `${year}0630` },
        3: { start: `${year}0701`, end: `${year}0930` },
        4: { start: `${year}1001`, end: `${year}1231` }
    };
    return ranges[quarter];
}

// ── 점검 목록 ──────────────────────────────────
async function loadInspections() {
    try {
        const { data, error } = await supabase
            .from('quarterly_inspections')
            .select('*')
            .order('year', { ascending: false })
            .order('quarter', { ascending: false });

        if (error) throw error;

        const el = document.getElementById('inspectionList');
        if (!data || data.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>분기점검 이력이 없습니다.<br>"새 분기점검 생성" 버튼을 눌러 시작하세요.</p></div>';
            return;
        }

        // 각 점검의 항목 수 조회
        const withCounts = await Promise.all(data.map(async ins => {
            const { count: total } = await supabase.from('inspection_items').select('*', { count: 'exact', head: true }).eq('inspection_id', ins.id);
            const { count: done } = await supabase.from('inspection_items').select('*', { count: 'exact', head: true }).eq('inspection_id', ins.id).eq('is_completed', true);
            return { ...ins, total: total || 0, done: done || 0 };
        }));

        el.innerHTML = withCounts.map(ins => {
            const pct = ins.total > 0 ? Math.round(ins.done / ins.total * 100) : 0;
            return `
            <div class="inspection-card ${ins.status === 'COMPLETED' ? 'completed' : ''}" onclick="openInspectionDetail(${ins.id})">
                <div style="flex:1">
                    <div class="inspection-card-title">
                        ${ins.year}년 ${ins.quarter}분기 점검
                        <span class="badge ${ins.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}" style="margin-left:8px">
                            ${ins.status === 'COMPLETED' ? '✅ 완료' : '🔄 진행중'}
                        </span>
                    </div>
                    <div class="inspection-card-meta">
                        작성: ${ins.created_by || '미지정'} · ${utils.formatDate(ins.created_at)} · 법령 ${ins.total}건
                        ${ins.status === 'COMPLETED' ? ' · 완료: ' + utils.formatDate(ins.completed_at) : ''}
                    </div>
                    <div class="progress-bar-wrap" style="margin-top:8px">
                        <div class="progress-bar" style="width:${pct}%"></div>
                    </div>
                    <div style="font-size:0.75rem;color:var(--gray-500);margin-top:4px">진행률 ${ins.done}/${ins.total} (${pct}%)</div>
                </div>
                <div style="font-size:0.8rem;color:var(--primary);white-space:nowrap">상세보기 →</div>
            </div>`;
        }).join('');
    } catch(e) {
        utils.toast('점검 목록 로드 실패: ' + e.message, 'error');
    }
}

// ── 새 점검 생성 모달 ──────────────────────────
function showCreateInspectionModal() {
    const { year, quarter } = utils.getCurrentQuarter();
    const yearSel = document.getElementById('newYear');
    yearSel.innerHTML = '';
    for (let y = year + 1; y >= 2023; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y + '년';
        if (y === year) opt.selected = true;
        yearSel.appendChild(opt);
    }
    document.getElementById('newQuarter').value = quarter;
    document.getElementById('newCreatedBy').value = '';
    document.getElementById('createInspectionModal').classList.add('show');
}

async function createInspection() {
    const year = parseInt(document.getElementById('newYear').value);
    const quarter = parseInt(document.getElementById('newQuarter').value);
    const createdBy = document.getElementById('newCreatedBy').value.trim();

    if (!createdBy) { utils.toast('작성자를 입력하세요', 'error'); return; }

    // 중복 체크
    const { data: exists } = await supabase
        .from('quarterly_inspections')
        .select('id')
        .eq('year', year)
        .eq('quarter', quarter)
        .single();

    if (exists) {
        if (!confirm(`${year}년 ${quarter}분기 점검이 이미 존재합니다. 계속 생성하시겠습니까?`)) return;
    }

    utils.showLoading();
    closeModal('createInspectionModal');

    try {
        // 1. 점검 레코드 생성
        const { data: newIns, error: insError } = await supabase
            .from('quarterly_inspections')
            .insert({ year, quarter, title: `${year}년 ${quarter}분기 법령 점검`, created_by: createdBy, status: 'IN_PROGRESS' })
            .select().single();
        if (insError) throw insError;

        // 2. 모니터링 법령 목록 조회
        const { data: laws, error: lawsError } = await supabase.from('laws').select('*');
        if (lawsError) throw lawsError;

        if (!laws || laws.length === 0) {
            utils.toast('모니터링 중인 법령이 없습니다. 먼저 법령을 추가해주세요.', 'error');
            utils.hideLoading();
            return;
        }

        // 3. 각 법령의 해당 분기 내 변경사항 전체 조회 (복수건 모두 포함)
        const { start: qStart, end: qEnd } = getQuarterDateRange(year, quarter);
        console.log(`분기 범위: ${qStart} ~ ${qEnd}`);

        const itemsPerLaw = await Promise.all(laws.map(async law => {
            const { data: changes } = await supabase
                .from('law_changes')
                .select('*')
                .eq('law_id', law.law_id)
                .gte('change_date', qStart)
                .lte('change_date', qEnd)
                .order('change_date', { ascending: false });

            if (changes && changes.length > 0) {
                // 개정건수만큼 행 생성
                return changes.map(change => ({
                    inspection_id: newIns.id,
                    law_id: law.law_id,
                    law_name: law.law_name,
                    serial_no: change.serial_no || law.serial_no || '',
                    ministry: law.ministry || '',
                    change_date: change.change_date,
                    change_type: change.change_type || '개정',
                    promulgation_no: change.promulgation_no || '',
                    revision_reason: change.revision_reason || '',
                    has_change: true,
                    action_status: 'PENDING',
                    is_completed: false
                }));
            } else {
                // 해당 분기 개정 없음 → 1행(변동없음)
                return [{
                    inspection_id: newIns.id,
                    law_id: law.law_id,
                    law_name: law.law_name,
                    serial_no: law.serial_no || '',
                    ministry: law.ministry || '',
                    change_date: '',
                    change_type: '해당없음',
                    promulgation_no: '',
                    revision_reason: '',
                    has_change: false,
                    action_status: 'PENDING',
                    is_completed: false
                }];
            }
        }));

        const items = itemsPerLaw.flat(); // 배열 평탄화

        // 4. 점검 항목 일괄 삽입
        const { error: itemsError } = await supabase.from('inspection_items').insert(items);
        if (itemsError) throw itemsError;

        utils.toast(`${year}년 ${quarter}분기 점검이 생성되었습니다 (${laws.length}건)`, 'success');
        await loadInspections();
        await openInspectionDetail(newIns.id);

    } catch(e) {
        utils.toast('생성 실패: ' + e.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

// ── 점검 상세 ──────────────────────────────────
async function openInspectionDetail(id) {
    utils.showLoading();
    try {
        currentInspectionId = id;

        const { data: ins } = await supabase
            .from('quarterly_inspections')
            .select('*')
            .eq('id', id)
            .single();

        currentInspectionData = ins;

        const { data: items } = await supabase
            .from('inspection_items')
            .select('*')
            .eq('inspection_id', id)
            .order('law_name');

        // 화면 전환
        document.getElementById('inspection-list-view').style.display = 'none';
        document.getElementById('inspection-detail-view').style.display = 'block';

        document.getElementById('detail-title').textContent = `${ins.year}년 ${ins.quarter}분기 법령 점검`;
        document.getElementById('detail-meta').textContent =
            `작성: ${ins.created_by || '-'} · ${utils.formatDate(ins.created_at)} · 법령 ${items?.length || 0}건`;

        renderInspectionItems(items || [], ins);
    } catch(e) {
        utils.toast('점검 상세 로드 실패: ' + e.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

function renderInspectionItems(items, ins) {
    const total = items.length;
    const done = items.filter(i => i.is_completed).length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;

    document.getElementById('detail-progress-text').textContent = `${done} / ${total} (${pct}%)`;
    document.getElementById('detail-progress-bar').style.width = pct + '%';

    const tbody = document.getElementById('inspectionItemsBody');
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--gray-500)">점검 항목이 없습니다</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const rowStyle = item.is_completed ? 'background:#f0fdf4' : item.has_change ? 'background:#fffbeb' : '';
        // 개정이유 요약 (100자 이내) - XML/CDATA 제거
        const reason = cleanRevisionText(item.revision_reason || '');
        const reasonSummary = reason.length > 100 ? reason.substring(0, 100) + '...' : reason;
        const hasReason = reason.length > 0;

        return `
        <tr id="row-${item.id}" style="${rowStyle}">
            <td>
                <div style="font-weight:600;margin-bottom:4px">${utils.escapeHtml(item.law_name)}</div>
                ${item.has_change
                    ? '<span class="badge badge-warning" style="font-size:0.7rem">개정있음</span>'
                    : '<span class="badge badge-gray" style="font-size:0.7rem">변동없음</span>'}
                ${hasReason ? `
                <div style="margin-top:8px;padding:8px 10px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:4px;font-size:0.78rem;color:#78350f;line-height:1.5">
                    ${utils.escapeHtml(reasonSummary)}
                </div>
                <button onclick="showRevisionDetail('${utils.escapeHtml(item.law_name)}', '${encodeURIComponent(reason)}', '${item.serial_no || ''}')" 
                        style="margin-top:6px;font-size:0.75rem;color:#4f46e5;background:none;border:1px solid #c7d2fe;border-radius:6px;padding:3px 10px;cursor:pointer">
                    📄 개정이유 상세보기
                </button>` : ''}
            </td>
            <td style="font-size:0.8rem">${utils.escapeHtml(item.ministry || '-')}</td>
            <td style="font-size:0.8rem;white-space:nowrap">${item.change_date ? utils.formatDate(item.change_date) : '-'}</td>
            <td style="font-size:0.8rem;white-space:nowrap">${item.enforcement_date ? utils.formatDate(item.enforcement_date) : '-'}</td>
            <td style="font-size:0.8rem">
                ${item.is_other_law
                    ? '<span class="badge" style="background:#fee2e2;color:#991b1b;font-size:0.7rem">타법개정</span>'
                    : utils.escapeHtml(item.change_type || '-')
                }
            </td>
            <td><input type="text" value="${utils.escapeHtml(item.assignee || '')}" placeholder="담당자" id="assignee-${item.id}" style="width:90px"></td>
            <td><input type="text" value="${utils.escapeHtml(item.department || '')}" placeholder="부서" id="dept-${item.id}" style="width:80px"></td>
            <td style="text-align:center">
                <input type="checkbox" id="action-${item.id}" ${item.action_required ? 'checked' : ''} onchange="toggleActionRequired(${item.id}, this.checked)">
            </td>
            <td><textarea id="content-${item.id}" rows="2" placeholder="조치내용 입력..." style="width:100%;min-width:180px;resize:vertical">${utils.escapeHtml(item.action_content || '')}</textarea></td>
            <td style="text-align:center">
                <input type="checkbox" id="complete-${item.id}" ${item.is_completed ? 'checked' : ''}>
                <div style="margin-top:4px">
                    <button onclick="saveItem(${item.id})" class="btn btn-primary btn-xs">저장</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function toggleActionRequired(itemId, checked) {
    const contentArea = document.getElementById(`content-${itemId}`);
    if (checked) {
        contentArea.style.border = '1.5px solid var(--warning)';
    } else {
        contentArea.style.border = '';
    }
}

// 개별 항목 저장
async function saveItem(itemId) {
    const assignee = document.getElementById(`assignee-${itemId}`)?.value || '';
    const department = document.getElementById(`dept-${itemId}`)?.value || '';
    const actionRequired = document.getElementById(`action-${itemId}`)?.checked || false;
    const actionContent = document.getElementById(`content-${itemId}`)?.value || '';
    const isCompleted = document.getElementById(`complete-${itemId}`)?.checked || false;

    try {
        const { error } = await supabase.from('inspection_items').update({
            assignee, department, action_required: actionRequired,
            action_content: actionContent, is_completed: isCompleted,
            action_status: isCompleted ? 'COMPLETED' : actionRequired ? 'IN_PROGRESS' : 'NOT_REQUIRED',
            updated_at: new Date().toISOString()
        }).eq('id', itemId);

        if (error) throw error;

        // 행 색상 업데이트
        const row = document.getElementById(`row-${itemId}`);
        if (row) row.style.background = isCompleted ? '#f0fdf4' : '';

        utils.toast('저장되었습니다', 'success');
        updateProgress();
    } catch(e) {
        utils.toast('저장 실패: ' + e.message, 'error');
    }
}

// 전체 저장
async function saveAllItems() {
    utils.showLoading();
    try {
        const rows = document.querySelectorAll('[id^="row-"]');
        const updates = [];

        for (const row of rows) {
            const itemId = row.id.replace('row-', '');
            updates.push({
                id: parseInt(itemId),
                assignee: document.getElementById(`assignee-${itemId}`)?.value || '',
                department: document.getElementById(`dept-${itemId}`)?.value || '',
                action_required: document.getElementById(`action-${itemId}`)?.checked || false,
                action_content: document.getElementById(`content-${itemId}`)?.value || '',
                is_completed: document.getElementById(`complete-${itemId}`)?.checked || false
            });
        }

        for (const u of updates) {
            await supabase.from('inspection_items').update({
                assignee: u.assignee, department: u.department,
                action_required: u.action_required, action_content: u.action_content,
                is_completed: u.is_completed,
                action_status: u.is_completed ? 'COMPLETED' : u.action_required ? 'IN_PROGRESS' : 'NOT_REQUIRED',
                updated_at: new Date().toISOString()
            }).eq('id', u.id);
        }

        utils.toast(`${updates.length}건 전체 저장 완료`, 'success');
        updateProgress();
    } catch(e) {
        utils.toast('저장 실패: ' + e.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

async function updateProgress() {
    if (!currentInspectionId) return;
    const { data: items } = await supabase.from('inspection_items').select('is_completed').eq('inspection_id', currentInspectionId);
    const total = items?.length || 0;
    const done = items?.filter(i => i.is_completed).length || 0;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    document.getElementById('detail-progress-text').textContent = `${done} / ${total} (${pct}%)`;
    document.getElementById('detail-progress-bar').style.width = pct + '%';
}

// 점검 완료 처리
async function completeInspection() {
    if (!confirm('점검을 완료 처리하시겠습니까?\n완료 후에도 내용 수정은 가능합니다.')) return;
    try {
        await saveAllItems();
        const { error } = await supabase.from('quarterly_inspections').update({
            status: 'COMPLETED', completed_at: new Date().toISOString()
        }).eq('id', currentInspectionId);
        if (error) throw error;
        utils.toast('점검이 완료 처리되었습니다', 'success');
    } catch(e) {
        utils.toast('완료 처리 실패: ' + e.message, 'error');
    }
}

// XML/CDATA 제거 텍스트 정제 함수
function cleanRevisionText(raw) {
    if (!raw) return '';
    return raw
        .replace(/<!\[CDATA\[/g, '')   // CDATA 시작 태그 제거
        .replace(/\]\]>/g, '')          // CDATA 종료 태그 제거
        .replace(/<[^>]+>/g, '')        // 모든 XML 태그 제거
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') // HTML 엔티티
        .replace(/\n{3,}/g, '\n\n')    // 여러 빈 줄 정리
        .replace(/^\s+|\s+$/g, '')      // 앞뒤 공백 제거
        .trim();
}

// 개정이유 상세보기 모달
function showRevisionDetail(lawName, encodedReason, serialNo) {
    const rawReason = decodeURIComponent(encodedReason);
    const reason = cleanRevisionText(rawReason);
    const modal = document.getElementById('revisionDetailModal');
    document.getElementById('revisionDetailLawName').textContent = lawName;
    document.getElementById('revisionDetailContent').textContent = reason || '개정이유 내용이 없습니다.';

    const lawLink = document.getElementById('revisionDetailLawLink');
    if (serialNo) {
        lawLink.href = `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${serialNo}`;
        lawLink.style.display = 'inline-flex';
    } else {
        lawLink.style.display = 'none';
    }
    modal.classList.add('show');
}

// 신규 추가된 법령 동기화 (점검 생성 후 추가된 법령 반영)
async function syncNewLaws() {
    if (!currentInspectionId || !currentInspectionData) return;
    if (!confirm('모니터링 법령 목록과 점검 항목을 동기화합니다.\n점검 생성 이후 새로 추가된 법령이 목록에 추가됩니다.')) return;

    utils.showLoading();
    try {
        const ins = currentInspectionData;
        const { start: qStart, end: qEnd } = getQuarterDateRange(ins.year, ins.quarter);

        // 1. 현재 모니터링 법령 전체
        const { data: allLaws } = await supabase.from('laws').select('*');

        // 2. 현재 점검에 있는 법령 law_id 목록
        const { data: existingItems } = await supabase
            .from('inspection_items')
            .select('law_id')
            .eq('inspection_id', currentInspectionId);

        const existingLawIds = new Set(existingItems.map(i => i.law_id));

        // 3. 점검에 없는 신규 법령 필터
        const newLaws = allLaws.filter(l => !existingLawIds.has(l.law_id));

        if (newLaws.length === 0) {
            utils.toast('새로 추가된 법령이 없습니다. 이미 동기화되어 있습니다.', 'info');
            utils.hideLoading();
            return;
        }

        // 4. 신규 법령에 대한 해당 분기 변경사항 전체 조회 후 추가
        const itemsPerLaw = await Promise.all(newLaws.map(async law => {
            const { data: changes } = await supabase
                .from('law_changes')
                .select('*')
                .eq('law_id', law.law_id)
                .gte('change_date', qStart)
                .lte('change_date', qEnd)
                .order('change_date', { ascending: false });

            if (changes && changes.length > 0) {
                return changes.map(change => ({
                    inspection_id: currentInspectionId,
                    law_id: law.law_id,
                    law_name: law.law_name,
                    serial_no: change.serial_no || law.serial_no || '',
                    ministry: law.ministry || '',
                    change_date: change.change_date,
                    change_type: change.change_type || '개정',
                    promulgation_no: change.promulgation_no || '',
                    revision_reason: change.revision_reason || '',
                    has_change: true,
                    action_status: 'PENDING',
                    is_completed: false
                }));
            } else {
                return [{
                    inspection_id: currentInspectionId,
                    law_id: law.law_id,
                    law_name: law.law_name,
                    serial_no: law.serial_no || '',
                    ministry: law.ministry || '',
                    change_date: '',
                    change_type: '해당없음',
                    promulgation_no: '',
                    revision_reason: '',
                    has_change: false,
                    action_status: 'PENDING',
                    is_completed: false
                }];
            }
        }));

        const newItems = itemsPerLaw.flat();

        const { error } = await supabase.from('inspection_items').insert(newItems);
        if (error) throw error;

        utils.toast(`법령 ${newLaws.length}건이 추가되었습니다!`, 'success');
        await openInspectionDetail(currentInspectionId);

    } catch(e) {
        utils.toast('동기화 실패: ' + e.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

// 점검 항목 변경사항 새로고침 (배치 수집 후 반영)
async function refreshInspectionItems() {
    if (!currentInspectionId) return;
    if (!confirm('법령 변경사항을 다시 조회하여 점검 항목을 업데이트하시겠습니까?\n담당자/조치내용 등 입력한 내용은 유지됩니다.')) return;

    utils.showLoading();
    try {
        const { data: items } = await supabase
            .from('inspection_items')
            .select('*')
            .eq('inspection_id', currentInspectionId);

        // 현재 점검의 년도/분기 가져와서 날짜 범위 계산
        const ins = currentInspectionData;
        const { start: qStart, end: qEnd } = getQuarterDateRange(ins.year, ins.quarter);

        let updatedCount = 0;
        for (const item of items) {
            const { data: changes } = await supabase
                .from('law_changes')
                .select('*')
                .eq('law_id', item.law_id)
                .gte('change_date', qStart)
                .lte('change_date', qEnd)
                .order('change_date', { ascending: false });

            if (changes && changes.length > 0) {
                // 해당 개정건이 1건이면 현재 항목 업데이트
                const firstChange = changes[0];
                await supabase.from('inspection_items').update({
                    change_date: firstChange.change_date,
                    change_type: firstChange.change_type,
                    serial_no: firstChange.serial_no,
                    promulgation_no: firstChange.promulgation_no,
                    revision_reason: firstChange.revision_reason,
                    enforcement_date: firstChange.enforcement_date || '',
                    is_other_law: firstChange.is_other_law || false,
                    has_change: true
                }).eq('id', item.id);

                // 추가 개정건이 있으면 신규 항목 추가
                if (changes.length > 1) {
                    const extraItems = changes.slice(1).map(change => ({
                        inspection_id: currentInspectionId,
                        law_id: item.law_id,
                        law_name: item.law_name,
                        ministry: item.ministry,
                        serial_no: change.serial_no,
                        change_date: change.change_date,
                        change_type: change.change_type,
                        promulgation_no: change.promulgation_no,
                        revision_reason: change.revision_reason,
                        enforcement_date: change.enforcement_date || '',
                        is_other_law: change.is_other_law || false,
                        has_change: true,
                        action_status: 'PENDING',
                        is_completed: false
                    }));
                    await supabase.from('inspection_items').insert(extraItems);
                }
                updatedCount++;
            } else {
                // 해당 분기 내 개정 없음 → 변동없음으로 초기화
                await supabase.from('inspection_items').update({
                    change_date: null,
                    change_type: '해당없음',
                    serial_no: null,
                    promulgation_no: null,
                    revision_reason: null,
                    has_change: false
                }).eq('id', item.id);
            }
        }

        utils.toast(`${updatedCount}건 변경사항 반영 완료`, 'success');
        await openInspectionDetail(currentInspectionId);
    } catch(e) {
        utils.toast('새로고침 실패: ' + e.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

// 점검 목록으로 돌아가기
function closeInspectionDetail() {
    currentInspectionId = null;
    currentInspectionData = null;
    document.getElementById('inspection-list-view').style.display = 'block';
    document.getElementById('inspection-detail-view').style.display = 'none';
    loadInspections();
}

// ── 보고서 ──────────────────────────────────────
async function loadReportList() {
    try {
        const { data } = await supabase
            .from('quarterly_inspections')
            .select('*')
            .order('year', { ascending: false })
            .order('quarter', { ascending: false });

        const sel = document.getElementById('reportInspectionSelect');
        sel.innerHTML = '<option value="">-- 보고서를 생성할 분기점검을 선택하세요 --</option>';
        (data || []).forEach(ins => {
            const opt = document.createElement('option');
            opt.value = ins.id;
            opt.textContent = `${ins.year}년 ${ins.quarter}분기 점검 (${ins.status === 'COMPLETED' ? '완료' : '진행중'})`;
            sel.appendChild(opt);
        });

        // 현재 점검이 선택된 상태면 자동 선택
        if (currentInspectionId) {
            sel.value = currentInspectionId;
        }
    } catch(e) {}
}

async function generateReport() {
    const inspectionId = document.getElementById('reportInspectionSelect').value;
    if (!inspectionId) { utils.toast('점검 기간을 선택하세요', 'error'); return; }

    utils.showLoading();
    try {
        // 점검 기본 정보
        const { data: ins } = await supabase
            .from('quarterly_inspections')
            .select('*')
            .eq('id', inspectionId)
            .single();

        // 점검 항목 (모든 항목)
        const { data: items } = await supabase
            .from('inspection_items')
            .select('*')
            .eq('inspection_id', inspectionId)
            .order('law_name');

        const total = items?.length || 0;
        const changed = items?.filter(i => i.has_change).length || 0;
        const actionRequired = items?.filter(i => i.action_required).length || 0;
        const completed = items?.filter(i => i.is_completed).length || 0;

        const quarterRanges = { 1: '01.01 ~ 03.31', 2: '04.01 ~ 06.30', 3: '07.01 ~ 09.30', 4: '10.01 ~ 12.31' };
        const today = new Date().toLocaleDateString('ko-KR');

        const reportHtml = `
        <div class="report-wrap" id="reportContent">

            <div class="report-header">
                <h2>${ins.year}년 ${ins.quarter}분기 법령 개정사항 점검 결과 보고</h2>
                <p>의왕도시공사 안전관리팀</p>
            </div>

            <table class="report-info-table">
                <tr><td>점검 기간</td><td>${ins.year}.${quarterRanges[ins.quarter]}</td><td>작성일</td><td>${today}</td></tr>
                <tr><td>담당부서</td><td>안전관리팀</td><td>작성자</td><td>${ins.created_by || '-'}</td></tr>
                <tr><td>점검 법령 수</td><td>${total}건</td><td>점검 상태</td><td>${ins.status === 'COMPLETED' ? '✅ 완료' : '🔄 진행중'}</td></tr>
            </table>

            <h4 style="font-size:1rem;font-weight:700;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #222">1. 점검 결과 요약</h4>
            <table class="report-info-table" style="margin-bottom:24px">
                <tr>
                    <td>전체 점검 법령</td><td><strong>${total}건</strong></td>
                    <td>개정 확인 법령</td><td><strong>${changed}건</strong></td>
                </tr>
                <tr>
                    <td>조치 필요</td><td><strong style="color:#d97706">${actionRequired}건</strong></td>
                    <td>점검 완료</td><td><strong style="color:#16a34a">${completed}건</strong></td>
                </tr>
            </table>

            <h4 style="font-size:1rem;font-weight:700;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #222">2. 법령별 점검 결과</h4>
            <table class="report-table">
                <thead>
                    <tr>
                        <th style="width:30px">No</th>
                        <th style="min-width:120px">법령명</th>
                        <th style="width:70px">소관부처</th>
                        <th style="width:70px">개정일</th>
                        <th style="width:60px">개정구분</th>
                        <th style="min-width:180px">개정 주요내용</th>
                        <th style="width:60px">담당자</th>
                        <th style="width:60px">담당부서</th>
                        <th style="width:50px">조치<br>필요</th>
                        <th style="min-width:150px">조치 내용</th>
                        <th style="width:40px">완료</th>
                    </tr>
                </thead>
                <tbody>
                    ${(items || []).map((item, i) => {
                        const cleanReason = cleanRevisionText(item.revision_reason || '');
                        const shortReason = cleanReason.length > 150
                            ? cleanReason.substring(0, 150) + '...'
                            : cleanReason;
                        return `
                    <tr style="${item.is_completed ? 'background:#f0fdf4' : item.has_change ? 'background:#fffbeb' : ''}">
                        <td>${i + 1}</td>
                        <td style="text-align:left;font-weight:600">${utils.escapeHtml(item.law_name)}</td>
                        <td>${utils.escapeHtml(item.ministry || '-')}</td>
                        <td>${item.change_date ? utils.formatDate(item.change_date) : '-'}</td>
                        <td>${utils.escapeHtml(item.change_type || '-')}</td>
                        <td style="text-align:left;font-size:0.75rem;line-height:1.5">${utils.escapeHtml(shortReason || '-')}</td>
                        <td>${utils.escapeHtml(item.assignee || '-')}</td>
                        <td>${utils.escapeHtml(item.department || '-')}</td>
                        <td>${item.action_required ? '✅' : '-'}</td>
                        <td style="text-align:left;font-size:0.8rem">${utils.escapeHtml(item.action_content || '-')}</td>
                        <td>${item.is_completed ? '✅' : '○'}</td>
                    </tr>`;
                    }).join('')}
                </tbody>
            </table>

            <h4 style="font-size:1rem;font-weight:700;margin:24px 0 12px;padding-bottom:6px;border-bottom:2px solid #222">3. 특기사항</h4>
            <div style="border:1px solid #ddd;border-radius:6px;padding:16px;min-height:80px;font-size:0.875rem;color:#444;margin-bottom:24px">
                ${actionRequired > 0
                    ? `· 조치 필요 법령 ${actionRequired}건에 대한 내부 검토 및 업무 반영 조치 완료<br>` +
                      items.filter(i => i.action_required).map(i =>
                        `  - ${i.law_name}: ${i.action_content || '조치 내용 미입력'}`).join('<br>')
                    : '· 해당 분기 법령 개정에 따른 특이사항 없음'}
            </div>

            <h4 style="font-size:1rem;font-weight:700;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #222">4. 결재</h4>
            <div class="report-sign">
                <div class="report-sign-cell">
                    <div class="report-sign-label">작 성</div>
                    <div style="font-size:0.85rem">${ins.created_by || ''}</div>
                </div>
                <div class="report-sign-cell">
                    <div class="report-sign-label">검 토</div>
                    <div>&nbsp;</div>
                </div>
                <div class="report-sign-cell">
                    <div class="report-sign-label">팀 장</div>
                    <div>&nbsp;</div>
                </div>
                <div class="report-sign-cell" style="border-right:none">
                    <div class="report-sign-label">처 장</div>
                    <div>&nbsp;</div>
                </div>
            </div>
        </div>`;

        document.getElementById('reportOutput').innerHTML = reportHtml;
        document.getElementById('printBtn').style.display = 'inline-flex';
        utils.toast('보고서가 생성되었습니다', 'success');

    } catch(e) {
        utils.toast('보고서 생성 실패: ' + e.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

function printReport() {
    window.print();
}

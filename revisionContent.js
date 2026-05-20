// 법령 개정 내용 보기 (DB에서 조회)

// 법령 개정 내용 텍스트 표시
async function showRevisionContent(change) {
    try {
        utils.showLoading();
        
        console.log('📜 개정 내용 보기:', change);
        console.log('law_id로 조회:', change.law_id);
        
        // 1. 해당 법령의 최근 3건 개정 이력 조회 (DB에서!)
        const { data: recentChanges, error: historyError } = await supabase
            .from('law_changes')
            .select('*')
            .eq('law_id', change.law_id)
            .order('change_date', { ascending: false })
            .limit(3);
            
        console.log('조회 결과:', recentChanges);
        console.log('조회 오류:', historyError);
            
        if (historyError) {
            console.error('개정 이력 조회 오류:', historyError);
        }
        
        // 2. 개정 정보 포맷팅
        const revisions = (recentChanges || []).map(rev => ({
            date: rev.change_date,
            type: rev.change_type,
            reason: rev.revision_reason || '', // DB에 저장된 제개정 이유
            serialNo: rev.serial_no,
            ministry: rev.ministry,
            promNo: rev.promulgation_no
        }));
        
        console.log('포맷팅된 개정 이력:', revisions);
        
        // 3. 법령 기본 정보 (law_name이 없으면 DB에서 가져온 것 사용)
        const lawInfo = {
            name: change.law_name || (recentChanges?.[0]?.law_name) || '법령명 없음',
            lawId: change.law_id,
            serialNo: change.serial_no || (recentChanges?.[0]?.serial_no),
            ministry: change.ministry || (recentChanges?.[0]?.ministry)
        };
        
        console.log('법령 정보:', lawInfo);
        
        // 4. 모달에 표시
        showRevisionModal(lawInfo, revisions, change);
        
    } catch (error) {
        console.error('개정 내용 조회 오류:', error);
        utils.showAlert('개정 내용을 불러오는 중 오류가 발생했습니다: ' + error.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

// 개정 내용 포맷팅
function formatRevisionContent(lawInfo, revisions) {
    let content = `
<div style="background: linear-gradient(135deg, #f8fafc 0%, white 100%); padding: 25px; border-radius: 12px; margin-bottom: 25px; border: 2px solid #e2e8f0;">
    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
        <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #2563eb 0%, #0891b2 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
            ⚖️
        </div>
        <div style="flex: 1;">
            <h3 style="margin: 0; color: #1e293b; font-size: 1.4rem;">${lawInfo.name}</h3>
            <div style="margin: 8px 0 0 0; display: flex; gap: 15px; flex-wrap: wrap;">
                <span style="color: #64748b; font-size: 0.9rem;">법령ID: ${lawInfo.lawId}</span>
                <span style="color: #64748b; font-size: 0.9rem;">소관: ${lawInfo.ministry || '-'}</span>
            </div>
        </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px;">
        <button onclick="openLawPage('${lawInfo.serialNo}')" 
           class="btn btn-primary"
           style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; border-radius: 8px; font-weight: 500; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3); border: none; cursor: pointer;">
            📖 법제처에서 보기
        </button>
        <button onclick="openSingumunComparison('${lawInfo.serialNo}')" 
           class="btn btn-revision"
           style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: white; border-radius: 8px; font-weight: 500; box-shadow: 0 2px 8px rgba(8, 145, 178, 0.3); border: none; cursor: pointer;">
            🔄 신구문대조표
        </button>
    </div>
</div>
`;

    if (revisions && revisions.length > 0) {
        // 모든 개정 이력 표시 (제개정 이유 없어도 OK)
        const revisionsWithReason = revisions;
        
        content += `
<div style="background: white; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0;">
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e2e8f0;">
        <span style="font-size: 1.5rem;">📅</span>
        <h4 style="margin: 0; color: #1e293b; font-size: 1.2rem;">최근 3건 제개정 이력</h4>
        <span style="background: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">
            ${revisionsWithReason.length}건
        </span>
    </div>
    
    ${revisionsWithReason.length > 0 ? `
    <div style="position: relative; padding-left: 30px;">
        <!-- 타임라인 -->
        <div style="position: absolute; left: 19px; top: 0; bottom: 0; width: 2px; background: linear-gradient(180deg, #2563eb 0%, #e2e8f0 100%);"></div>
        
        ${revisionsWithReason.map((revision, index) => `
            <div style="position: relative; margin-bottom: ${index === revisionsWithReason.length - 1 ? '0' : '30px'};">
                <!-- 타임라인 점 -->
                <div style="position: absolute; left: -30px; top: 8px; width: 20px; height: 20px; background: white; border: 3px solid #2563eb; border-radius: 50%; box-shadow: 0 0 0 4px #dbeafe;"></div>
                
                <!-- 개정 카드 -->
                <div style="background: linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%); padding: 20px; border-radius: 10px; border-left: 4px solid #f59e0b; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="background: #fbbf24; color: white; padding: 4px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600;">
                                ${revision.type}
                            </span>
                            <span style="color: #92400e; font-weight: 600; font-size: 0.95rem;">
                                ${revision.date ? revision.date.substring(0,4) + '.' + revision.date.substring(4,6) + '.' + revision.date.substring(6,8) : '-'}
                            </span>
                        </div>
                    </div>
                    
                    <div style="color: #451a03; line-height: 1.8; white-space: pre-wrap; background: white; padding: 15px; border-radius: 8px; font-size: 0.95rem;">
                        ${revision.reason || '<span style="color: #94a3b8; font-style: italic;">❌ 제개정 이유 없음 (법제처 API에서 제공하지 않음)</span>'}
                    </div>
                </div>
            </div>
        `).join('')}
    </div>
    ` : `
    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; text-align: center;">
        <p style="color: #92400e; margin: 0; font-weight: 600;">⚠️ DB에 제개정 이유가 없습니다</p>
        <p style="color: #78350f; margin: 10px 0 0 0; font-size: 0.9rem;">
            "관리" 탭에서 "변경사항 수집" 버튼을 눌러주세요.
        </p>
    </div>
    `}
    
    <div style="margin-top: 20px; padding: 20px; background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%); border-radius: 10px; border: 2px solid #0891b2;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="font-size: 2rem; line-height: 1;">📍</div>
            <div style="flex: 1;">
                <p style="margin: 0 0 10px 0; color: #0c4a6e; font-size: 1rem; font-weight: 600;">
                    구체적인 변경 내용 확인 방법
                </p>
                <ol style="margin: 0; padding-left: 20px; color: #0e7490; font-size: 0.9rem; line-height: 1.8;">
                    <li>위의 <strong>"🔄 신구문대조표"</strong> 버튼 클릭</li>
                    <li>법제처 페이지에서 <strong>"제정·개정이유"</strong> 탭 클릭</li>
                    <li>개정 목록에서 일자 클릭 → 신구문대조표 확인!</li>
                </ol>
                <p style="margin: 10px 0 0 0; padding: 10px; background: white; border-radius: 6px; color: #64748b; font-size: 0.85rem;">
                    📝 변경된 조문을 <span style="color: #dc2626; font-weight: 600;">이전 내용</span>과 <span style="color: #16a34a; font-weight: 600;">변경 내용</span>으로 비교하여 보실 수 있습니다.
                </p>
            </div>
        </div>
    </div>
</div>
`;
    } else {
        content += `
<div style="background: #fee2e2; padding: 30px; border: 2px solid #fca5a5; border-radius: 12px; text-align: center;">
    <div style="font-size: 3rem; margin-bottom: 15px; opacity: 0.7;">📭</div>
    <p style="color: #991b1b; margin: 0 0 10px 0; font-weight: 600; font-size: 1.1rem;">최근 3건 제개정 이력이 없습니다</p>
    <p style="color: #7f1d1d; margin: 0 0 15px 0; font-size: 0.95rem;">
        데이터베이스에서 개정 이력을 찾을 수 없습니다.
    </p>
    <div style="background: white; padding: 20px; border-radius: 8px; margin-top: 15px;">
        <p style="color: #64748b; margin: 0 0 15px 0; font-size: 1rem; font-weight: 600;">
            📌 해결 방법
        </p>
        <ol style="text-align: left; color: #475569; margin: 0; padding-left: 25px; line-height: 1.8;">
            <li><strong>"관리"</strong> 탭으로 이동</li>
            <li><strong>"🔄 변경사항 수집"</strong> 버튼 클릭</li>
            <li>배치 작업 완료 대기 (약 30초~1분)</li>
            <li>다시 개정 내용 확인</li>
        </ol>
    </div>
</div>
`;
    }
    
    return content;
}

// 법제처 페이지 열기
function openLawPage(serialNo) {
    const url = `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${serialNo}`;
    
    const width = 1400;
    const height = 900;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    window.open(
        url,
        'law_detail',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );
    
    // 안내 메시지
    setTimeout(() => {
        alert('📍 법제처 페이지가 열립니다.\n\n🔹 "제정·개정이유" 탭을 클릭하면\n   신구문대조표를 확인할 수 있습니다.');
    }, 500);
}

// 신구문대조표 보기 (안내 후 페이지 열기)
function openSingumunComparison(serialNo) {
    // 메시지 표시
    const confirmed = confirm(
        '📖 신구문대조표 확인 방법\n' +
        '\n' +
        '1️⃣ 법제처 페이지가 열립니다\n' +
        '2️⃣ "제정·개정이유" 탭을 클릭하세요\n' +
        '3️⃣ 개정 목록에서 일자를 클릭하면\n' +
        '   신구문대조표를 보실 수 있습니다.\n' +
        '\n' +
        '계속하시겠습니까?'
    );
    
    if (!confirmed) return;
    
    const url = `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${serialNo}`;
    
    const width = 1400;
    const height = 900;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    window.open(
        url,
        'law_singumun',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );
}

// 개정 내용 모달 표시
function showRevisionModal(lawInfo, revisions, change) {
    const modal = document.getElementById('revisionModal');
    if (!modal) {
        createRevisionModal();
        return showRevisionModal(lawInfo, revisions, change);
    }
    
    document.getElementById('revisionModalTitle').innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 1.8rem;">📜</span>
            <span>개정 내용</span>
        </div>
    `;
    
    const content = formatRevisionContent(lawInfo, revisions);
    document.getElementById('revisionModalContent').innerHTML = content;
    
    // 현재 법령 정보 저장 (AI 요약용)
    window.currentRevisionLaw = change;
    
    modal.classList.add('show');
}

// 개정 내용 모달 생성
function createRevisionModal() {
    const modalHTML = `
        <div id="revisionModal" class="modal">
            <div class="modal-content" style="max-width: 1000px;">
                <span class="close" onclick="document.getElementById('revisionModal').classList.remove('show')">&times;</span>
                <h2 id="revisionModalTitle" style="color: #1e293b; margin-bottom: 25px;"></h2>
                <div id="revisionModalContent"></div>
                <div style="margin-top: 30px; text-align: right; display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn btn-secondary" onclick="document.getElementById('revisionModal').classList.remove('show')">
                        닫기
                    </button>
                    <button class="btn btn-success" onclick="openAISummaryFromRevision()">
                        🤖 AI 요약 보기
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// 개정 내용에서 AI 요약으로 전환
function openAISummaryFromRevision() {
    document.getElementById('revisionModal').classList.remove('show');
    
    if (window.currentRevisionLaw) {
        generateAISummary(window.currentRevisionLaw);
    }
}

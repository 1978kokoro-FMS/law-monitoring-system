// 법령 변경사항 로드 - DB에서 조회 (배치 작업 후 데이터 사용)
async function loadChanges() {
    utils.showLoading();
    
    try {
        // law_changes 테이블에서 조회 (배치 작업으로 수집한 데이터)
        const { data: changes, error } = await supabase
            .from('law_changes')
            .select('*')
            .order('change_date', { ascending: false })
            .limit(50);  // 최근 50건
            
        if (error) {
            throw error;
        }

        const changesContainer = document.getElementById('changesList');
        
        if (changes && changes.length > 0) {
            changesContainer.innerHTML = `
                <div style="background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%); padding: 20px; border-radius: 12px; margin-bottom: 25px; border-left: 4px solid #0891b2;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                        <span style="font-size: 2rem;">📊</span>
                        <h4 style="margin: 0; color: #0c4a6e; font-size: 1.2rem;">법령 변경사항 현황</h4>
                    </div>
                    <p style="margin: 0 0 8px 0; color: #0369a1; font-weight: 600; font-size: 1.1rem;">
                        총 <strong>${changes.length}건</strong>의 변경사항이 있습니다.
                    </p>
                    <p style="margin: 0; color: #64748b; font-size: 0.9rem;">
                        💡 "📜 개정 내용 보기"를 클릭하면 제개정 이유를 확인할 수 있습니다.
                    </p>
                </div>
            ` + changes.map(change => `
                <div class="change-card" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; border-left: 4px solid #f59e0b; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 1.1rem;">
                                ${utils.escapeHtml(change.law_name)}
                            </h4>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                <span style="background: #fbbf24; color: white; padding: 4px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600;">
                                    ${change.change_type || '개정'}
                                </span>
                                <span style="color: #64748b; font-size: 0.9rem;">
                                    📅 ${change.change_date ? change.change_date.substring(0,4) + '.' + change.change_date.substring(4,6) + '.' + change.change_date.substring(6,8) : '-'}
                                </span>
                                <span style="color: #64748b; font-size: 0.9rem;">
                                    🏛️ ${change.ministry || '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 0.9rem; color: #475569;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                            <div>
                                <span style="color: #94a3b8;">법령ID:</span> 
                                <strong>${change.law_id || '-'}</strong>
                            </div>
                            <div>
                                <span style="color: #94a3b8;">일련번호:</span> 
                                <strong>${change.serial_no || '-'}</strong>
                            </div>
                            ${change.promulgation_no ? `
                            <div>
                                <span style="color: #94a3b8;">공포번호:</span> 
                                <strong>${change.promulgation_no}</strong>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-revision" 
                                onclick='showRevisionContent(${JSON.stringify(change).replace(/'/g, "&apos;")})'>
                           📜 개정 내용 보기
                        </button>
                        <button class="btn btn-sm btn-success" 
                                onclick='generateAISummary(${JSON.stringify(change).replace(/'/g, "&apos;")})'>
                           🤖 AI 요약
                        </button>
                        <a href="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${change.serial_no}" 
                           target="_blank" 
                           class="btn btn-sm btn-primary">
                           📖 법제처에서 보기
                        </a>
                    </div>
                </div>
            `).join('');
        } else {
            changesContainer.innerHTML = `
                <div style="background: #fef3c7; padding: 30px; border-radius: 12px; text-align: center; border: 2px solid #fbbf24;">
                    <div style="font-size: 3rem; margin-bottom: 15px; opacity: 0.7;">📭</div>
                    <p style="margin: 0 0 10px 0; color: #92400e; font-weight: 600; font-size: 1.1rem;">
                        변경사항이 없습니다
                    </p>
                    <p style="margin: 0 0 20px 0; color: #78350f; font-size: 0.95rem;">
                        "⚙️ 관리" 탭에서 "🔄 변경사항 수집"을 실행하세요.
                    </p>
                    <button class="btn btn-primary" onclick="document.querySelector('[data-tab=admin]').click()">
                        ⚙️ 관리 탭으로 이동
                    </button>
                </div>
            `;
        }

    } catch (error) {
        console.error('변경사항 로드 오류:', error);
        document.getElementById('changesList').innerHTML = `
            <div style="background: #fee2e2; padding: 20px; border-radius: 12px; text-align: center; border: 2px solid #fca5a5;">
                <p style="margin: 0; color: #991b1b; font-weight: 600;">❌ 오류 발생</p>
                <p style="margin: 10px 0 0 0; color: #7f1d1d; font-size: 0.9rem;">${error.message}</p>
            </div>
        `;
    } finally {
        utils.hideLoading();
    }
}

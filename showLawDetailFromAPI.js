// API에서 법령 상세 보기 (새로운 함수)
async function showLawDetailFromAPI(lawData) {
    try {
        utils.showLoading();
        
        // 검색 결과에서 받은 모든 정보 저장
        state.selectedLaw = {
            law_id: lawData.law_id || lawData.serial_no,
            law_name: lawData.law_name,
            law_type: lawData.law_type,
            ministry: lawData.ministry,
            enacted_date: lawData.enacted_date,
            serial_no: lawData.serial_no,
            promulgation_no: lawData.promulgation_no,
            is_active: true
        };
        
        const modal = document.getElementById('lawDetailModal');
        document.getElementById('modalLawName').textContent = lawData.law_name;
        document.getElementById('modalLawContent').innerHTML = `
            <p><strong>법령ID:</strong> ${lawData.law_id}</p>
            <p><strong>일련번호:</strong> ${lawData.serial_no}</p>
            <p><strong>법령구분:</strong> ${lawData.law_type || '-'}</p>
            <p><strong>소관부처:</strong> ${lawData.ministry || '-'}</p>
            <p><strong>공포일자:</strong> ${lawData.enacted_date ? lawData.enacted_date.substring(0,4) + '-' + lawData.enacted_date.substring(4,6) + '-' + lawData.enacted_date.substring(6,8) : '-'}</p>
            <p><strong>공포번호:</strong> ${lawData.promulgation_no || '-'}</p>
            <hr>
            <p style="color: #666; margin-top: 20px;">
                💡 법령 전문 및 개정이력은 법제처 웹사이트에서 확인하실 수 있습니다.<br>
                <a href="https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${lawData.serial_no}" target="_blank" 
                   style="color: #2563eb; text-decoration: underline;">
                   법제처에서 보기 →
                </a>
            </p>
        `;

        modal.classList.add('show');
        
    } catch (error) {
        console.error('법령 상세 조회 오류:', error);
        utils.showAlert('법령 정보를 불러오는 중 오류가 발생했습니다.', 'error');
    } finally {
        utils.hideLoading();
    }
}


// AI 요약 기능

// AI 요약 생성 함수
async function generateAISummary(change) {
    try {
        utils.showLoading();
        
        // 1. 법령 상세 조회
        const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? `http://localhost:3000/api/law/detail/${change.serial_no}`
            : `/api/law/detail/${change.serial_no}`;
            
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error('법령 상세 조회 실패');
        }

        const xmlText = await response.text();
        
        // 2. XML 파싱 - 조문 내용 추출
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // 조문 내용 추출
        const articles = [];
        const articleElements = xmlDoc.getElementsByTagName('조문내용');
        const hangElements = xmlDoc.getElementsByTagName('완내용');
        const hoElements = xmlDoc.getElementsByTagName('호내용');
        
        // 조문 제목
        for (let i = 0; i < Math.min(articleElements.length, 5); i++) {
            articles.push(articleElements[i].textContent.trim());
        }
        
        // 항 내용 (처음 5개만)
        for (let i = 0; i < Math.min(hangElements.length, 5); i++) {
            articles.push(hangElements[i].textContent.trim());
        }
        
        // 호 내용 (처음 5개만)
        for (let i = 0; i < Math.min(hoElements.length, 5); i++) {
            articles.push(hoElements[i].textContent.trim());
        }
        
        const lawContent = articles.join('\n').substring(0, 3000); // 최대 3000자
        
        if (!lawContent || lawContent.length < 50) {
            throw new Error('법령 내용을 추출할 수 없습니다.');
        }
        
        // 3. 서버 AI API 호출
        const summaryApiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:3000/api/ai/summary'
            : '/api/ai/summary';
            
        const aiResponse = await fetch(summaryApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lawName: change.law_name,
                changeType: change.change_type,
                changeDate: change.change_date ? change.change_date.substring(0,4) + '년 ' + change.change_date.substring(4,6) + '월 ' + change.change_date.substring(6,8) + '일' : '-',
                ministry: change.ministry,
                lawContent: lawContent
            })
        });

        if (!aiResponse.ok) {
            throw new Error('AI 요약 생성 실패');
        }

        const aiResult = await aiResponse.json();
        const summary = aiResult.summary;
        
        // 4. 모달에 표시
        showAISummaryModal(change, summary);
        
    } catch (error) {
        console.error('AI 요약 오류:', error);
        utils.showAlert('AI 요약 생성 중 오류가 발생했습니다: ' + error.message, 'error');
    } finally {
        utils.hideLoading();
    }
}

// AI 요약 모달 표시
function showAISummaryModal(change, summary) {
    const modal = document.getElementById('aiSummaryModal');
    if (!modal) {
        createAISummaryModal();
        return showAISummaryModal(change, summary);
    }
    
    document.getElementById('aiSummaryTitle').textContent = change.law_name;
    document.getElementById('aiSummaryContent').innerHTML = formatMarkdown(summary);
    
    // 현재 법령 정보 저장 (조치사항 생성용)
    window.currentAILaw = {
        change: change,
        summary: summary
    };
    
    modal.classList.add('show');
}

// 마크다운 포맷팅 (간단한 변환)
function formatMarkdown(text) {
    return text
        .replace(/## (.*)/g, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/- (.*)/g, '<li>$1</li>')
        .replace(/(\d+)\. (.*)/g, '<li>$2</li>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

// AI 요약 모달 생성
function createAISummaryModal() {
    const modalHTML = `
        <div id="aiSummaryModal" class="modal">
            <div class="modal-content" style="max-width: 800px;">
                <span class="close" onclick="document.getElementById('aiSummaryModal').classList.remove('show')">&times;</span>
                <h2>🤖 AI 법령 분석</h2>
                <h3 id="aiSummaryTitle" style="color: #2563eb; margin-bottom: 20px;"></h3>
                <div id="aiSummaryContent" style="line-height: 1.8; max-height: 500px; overflow-y: auto;"></div>
                <div style="margin-top: 20px; text-align: right;">
                    <button class="btn btn-secondary" onclick="document.getElementById('aiSummaryModal').classList.remove('show')">닫기</button>
                    <button class="btn btn-success" onclick="createActionFromAI()">📋 조치사항 생성</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// AI 요약에서 조치사항 자동 생성
async function createActionFromAI() {
    if (!window.currentAILaw) return;
    
    const { change, summary } = window.currentAILaw;
    
    // 조치사항 폼에 자동 입력
    document.getElementById('actionTitle').value = `${change.law_name} 개정 대응`;
    document.getElementById('actionDescription').value = `[AI 분석 결과]\n\n${summary}`;
    document.getElementById('actionPriority').value = summary.includes('높음') ? 'HIGH' : summary.includes('낮음') ? 'LOW' : 'MEDIUM';
    
    // AI 요약 모달 닫기
    document.getElementById('aiSummaryModal').classList.remove('show');
    
    // 조치사항 모달 열기
    document.getElementById('actionModal').classList.add('show');
}

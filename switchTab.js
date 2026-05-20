// 탭 전환 유틸리티 함수
function switchToChangesTab() {
    // 변경사항 탭 버튼 찾기
    const changesTabBtn = document.querySelector('[data-tab="changes"]');
    
    if (changesTabBtn) {
        // 탭 버튼 클릭 (자동으로 탭 전환 및 데이터 로드)
        changesTabBtn.click();
    }
}

// 특정 탭으로 전환하는 범용 함수
function switchToTab(tabName) {
    const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    
    if (tabBtn) {
        tabBtn.click();
    }
}

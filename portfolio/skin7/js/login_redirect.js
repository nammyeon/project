$(function(){
    var loginButtons = document.querySelectorAll('.header-login-btn');
    
    loginButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            var contentValue = document.querySelector('meta[name="path_role"]').getAttribute('content');

            // 회원가입(MEMBER_JOIN)일 경우 returnUrl 없이 리다이렉트
            if (contentValue == 'MEMBER_JOIN') {
                window.location.href = '/member/login.html';
                return true;
            }

            // 기존 queryString이 있으면 유지함
            var existingParams = new URLSearchParams(window.location.search);
            var returnUrl = existingParams.has('returnUrl') ? existingParams.get('returnUrl') : window.location.pathname + window.location.search;
            existingParams.set('returnUrl', returnUrl);

            window.location.href = '/member/login.html?' + existingParams.toString();
        });
    });
});
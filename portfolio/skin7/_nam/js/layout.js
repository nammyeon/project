$(() => {
    NAMYEON.LAYOUT.init();
});

NAMYEON.LAYOUT = {
    init: function () {
        this.setBarba();
        this.setNavigation();

        this.initPageSpecificJS();
    },
    setBarba: function () {
        // 브라우저의 자동 스크롤 복원 비활성화
        if ("scrollRestoration" in history) {
            history.scrollRestoration = "manual";
        }

        // barba 전환 이펙트 설정
        barba.init({
            transitions: [
                {
                    name: "ultra-smooth-fade",
                    async leave(data) {
                        // 1. 전환 시작 클래스 추가
                        $("body").addClass("barba-transitioning");

                        // 2. 전환 시 페이드아웃
                        $("body").css("opacity", "0");

                        await new Promise((resolve) => setTimeout(resolve, 200));
                    },
                    async enter(data) {
                        // 1. 스크롤 맨 위로 이동
                        window.scrollTo(0, 0);

                        // 2. 전환 완료 페이드 인
                        $("body").css("opacity", "1");

                        // 3. 전환 클래스 제거
                        $("body").removeClass("barba-transitioning");

                        // 4. 페이지별 JavaScript 초기화
                        NAMYEON.LAYOUT.initPageSpecificJS();
                    },
                },
            ],
        });
    },
    setNavigation: function () {
        // 현재 네비게이션 액티브

        // 경우1. barba 전환 없을 경우 location.pathname 으로 현재 페이지 확인
        const currentPath = window.location.pathname;
        const currentPathArray = currentPath.split("/");

        if (currentPath == "/" || (currentPathArray[1].includes("skin-skin") && currentPathArray.length <= 2)) {
            // 메인
            $("#navigation > ul > li[data-nav='home']").addClass("active").siblings().removeClass("active");
        } else if (currentPathArray.includes("about")) {
            // 소개
            $("#navigation > ul > li[data-nav='about']").addClass("active").siblings().removeClass("active");
        } else if (currentPathArray.includes("work")) {
            // 작업물
            $("#navigation > ul > li[data-nav='work']").addClass("active").siblings().removeClass("active");
        } else if (currentPathArray.includes("contact")) {
            // 컨택
            $("#navigation > ul > li[data-nav='contact']").addClass("active").siblings().removeClass("active");
        }

        // 경우2. barba 전환 있을 경우 네비게이션 클릭 시 액티브 (블로그는 외부 경로이므로 제외)
        $("#navigation > ul > li:not([data-nav='blog'])").on("click", function () {
            $(this).addClass("active").siblings().removeClass("active");
        });
    },
    initPageSpecificJS: function () {
        // 현재 페이지 경로 확인
        const currentPath = window.location.pathname;

        // work detail 페이지인지 확인 (workDetail 요소가 있는지도 체크)
        if ((currentPath.includes("/work/detail/") || $("#workDetail").length > 0) && typeof NAMYEON.WORK !== "undefined") {
            // work.js 재초기화
            NAMYEON.WORK.init();
        }
    },
};

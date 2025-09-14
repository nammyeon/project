$(() => {
    NAMYEON.WORK.init();
});

NAMYEON.WORK = {
    init: function () {
        this.setImageLoad();
        this.viewResponsiveDesign();
        this.setLinkEmpty();
        this.setBackButtonHandler();
    },
    viewResponsiveDesign: function () {
        // 모바일 디자인 있을 때 코드 실행
        if ($(".workDetail__responsive").length == 0) {
            return;
        }

        const viewportHeight = $(window).height();

        $(window).on("scroll", function () {
            const scrollTop = $(window).scrollTop();
            const contentTop = $(".workDetail__responsive").offset().top;

            // 화면 절반에 왔을때 모바일 스크롤 진행시키기
            if (scrollTop + viewportHeight / 2 > contentTop) {
                NAMYEON.WORK.setStartImageScroll();
            } else {
                NAMYEON.WORK.setResetImageScroll();
            }
        });
    },

    setStartImageScroll: function () {
        const $figure = $(".workDetail__responsive > figure");
        const $img = $figure.find("img");

        // 이미지 로드 완료 후 실행
        $img.on("load", () => {
            this.setCalculateAndAnimateScroll($figure, $img);
        });

        // 이미지가 이미 로드된 경우
        if ($img[0].complete) {
            this.setCalculateAndAnimateScroll($figure, $img);
        }
    },

    setCalculateAndAnimateScroll: function ($figure, $img) {
        const figureHeight = $figure.height();
        const imgHeight = $img.height();
        const scrollDistance = imgHeight - figureHeight;

        if (scrollDistance > 0) {
            // 스크롤할 값이 있을 때만 애니메이션 실행
            const scrollSpeed = 300; // 초
            const duration = (scrollDistance / scrollSpeed) * 1000; // 밀리초로 변환

            $img.css("transition", `transform ${duration}ms linear`);

            // 스크롤 애니메이션 시작
            setTimeout(() => {
                $img.css("transform", `translateY(-${scrollDistance}px)`);
            }, 100);
        }
    },

    setResetImageScroll: function () {
        const $img = $(".workDetail__responsive > figure > img");
        $img.css({
            transform: "translateY(0)",
            transition: "transform 0.5s ease-out",
        });
    },

    setImageLoad: function () {
        setTimeout(() => {
            if ($(".workDetail__content img").attr("ec-data-src") !== "") {
                $(".workDetail__content img").each(function () {
                    const imgSrc = $(this).attr("ec-data-src");
                    $(this).attr("src", imgSrc);
                });
            }
        }, 100);
    },
    setLinkEmpty: function () {
        const $button = $(".workDetail__head-info .btn-normal");
        $button.each(function () {
            if ($(this).attr("href") == "") {
                $(this).remove();
            }
        });
    },
    setBackButtonHandler: function () {
        const $backButton = $("#workDetail .back");
        $backButton.on("click", function (e) {
            e.preventDefault();
            history.back();
        });
    },
};

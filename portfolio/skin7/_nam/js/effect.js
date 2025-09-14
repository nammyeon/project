$(() => {
    NAMYEON.EFFECT.init();
});

NAMYEON.EFFECT = {
    init: function () {
        this.setEffect();
    },
    setEffect: function () {
        let WIDTH = window.innerWidth;
        let HEIGHT = window.innerHeight;
        let MAX_PARTICLES = (WIDTH * HEIGHT) / 20000;
        let DRAW_INTERVAL = 60;
        const canvas = $("#starBackgroundCanvas")[0];
        const context = canvas.getContext("2d");
        let gradient = null;
        let pixies = new Array();

        function setDimensions(e) {
            WIDTH = window.innerWidth;
            HEIGHT = window.innerHeight;
            MAX_PARTICLES = (WIDTH * HEIGHT) / 20000;
            canvas.width = WIDTH;
            canvas.height = HEIGHT;
        }

        setDimensions();
        $(window).on("resize", setDimensions);

        function Circle() {
            this.settings = { ttl: 8000, xmax: 5, ymax: 2, rmin: 1, rmax: 5, drt: 1 };

            this.reset = function () {
                this.x = WIDTH * Math.random(); //X 위치 랜덤 (0 ~ WIDTH)
                this.y = HEIGHT * Math.random(); //Y 위치 랜덤 (0 ~ HEIGHT)
                this.r = (this.settings.rmax - 1) * Math.random() + 1; //반지름 크기 랜덤 (1 ~ rmax)
                this.hl = (this.settings.ttl / DRAW_INTERVAL) * (this.r / this.settings.rmax); //총 생존 시간 (반지름 크기에 비례)
                this.rt = 0; //현재 생존 시간 (0 -> hl -> 0)
                this.settings.drt = Math.random() + 1; //노화 속도 (1 ~ 2)
                this.stop = Math.random() * 0.05 + 0.1; //음영 범위 (0.4 ~ 0.6)
            };

            this.fade = function () {
                this.rt += this.settings.drt; //노화 진행

                if (this.rt >= this.hl) {
                    this.rt = this.hl;
                    this.settings.drt = this.settings.drt * -1;
                } else if (this.rt < 0) {
                    this.reset(); //수명이 다하면 새로운 위치에 생성
                }
            };

            this.draw = function () {
                var newo = this.rt / this.hl; //밝기 (0 ~ 1)
                context.beginPath();
                context.arc(this.x, this.y, this.r, 0, Math.PI * 2, true); //(x, y) 좌표에 반지름 r 크기의 원 그림
                context.closePath();

                var cr = this.r * newo; //밝기에 따른 반지름
                gradient = context.createRadialGradient(this.x, this.y, 0, this.x, this.y, cr < this.settings.rmin ? this.settings.rmin : cr);
                gradient.addColorStop(0.0, `rgba(255,255,255,${newo})`);
                gradient.addColorStop(this.stop, `rgba(77,101,181,${newo * 0.6})`);
                gradient.addColorStop(1.0, `rgba(77,101,181,0)`);
                context.fillStyle = gradient;
                context.fill();
            };
        }

        function draw() {
            context.clearRect(0, 0, WIDTH, HEIGHT);

            for (var i = pixies.length; i < MAX_PARTICLES; i++) {
                pixies.push(new Circle());
                pixies[i].reset();
            }

            for (var i = 0; i < MAX_PARTICLES; i++) {
                pixies[i].fade();
                pixies[i].draw();
            }
        }

        setInterval(draw, DRAW_INTERVAL);
    },
};

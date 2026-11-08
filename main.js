// 拼豆動畫：豆子先落下拼成瓢蟲，捲動時散開、重新拼成作品截圖
// shortcut: 只支援一件作品的動畫，要讓每件作品都有拼豆效果時，再把 stage 改成可重複
(async () => {
    const root = document.documentElement;
    if (!root.classList.contains("scrub")) return;

    const run = document.querySelector(".run");
    const stage = document.querySelector(".stage");
    const canvas = stage.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const heroSlot = stage.querySelector(".slot-hero");
    const workSlot = stage.querySelector(".slot-work");
    const heroImg = heroSlot.querySelector("img");
    const workImg = workSlot.querySelector("img");
    const heroPanel = stage.querySelector(".panel-hero");
    const workPanel = stage.querySelector(".panel-work");
    const hint = stage.querySelector(".hint");

    const clamp01 = (n) => Math.min(1, Math.max(0, n));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const easeOut = (t) => 1 - (1 - t) ** 3;

    // 把圖片縮成 cols × rows 格，每格的顏色就是一顆豆子
    const sample = (img, cols, rows) => {
        const c = document.createElement("canvas");
        c.width = cols;
        c.height = rows;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, cols, rows);
        return g.getImageData(0, 0, cols, rows).data;
    };

    let beads = [];
    let grid;
    let heroPitch = 0;
    let workPitch = 0;
    let lastWidth = 0;
    let dpr = 1;

    const build = () => {
        const small = innerWidth <= 700;
        // 作品格數要 ≥ 瓢蟲格數，瓢蟲才不會缺豆子；多的豆子會疊在同一格
        grid = small ? { hc: 24, hr: 21, wc: 32, wr: 20 } : { hc: 40, hr: 35, wc: 48, wr: 30 };
        const heroData = sample(heroImg, grid.hc, grid.hr);
        const workData = sample(workImg, grid.wc, grid.wr);
        const heroCells = grid.hc * grid.hr;
        const count = grid.wc * grid.wr;
        const order = Array.from({ length: heroCells }, (_, i) => i);
        for (let i = heroCells - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        beads = Array.from({ length: count }, (_, i) => {
            const h = order[i % heroCells];
            return {
                hx: h % grid.hc,
                hy: Math.floor(h / grid.hc),
                wx: i % grid.wc,
                wy: Math.floor(i / grid.wc),
                hc: [heroData[h * 4], heroData[h * 4 + 1], heroData[h * 4 + 2]],
                wc: [workData[i * 4], workData[i * 4 + 1], workData[i * 4 + 2]],
                delay: Math.random(),
            };
        });
    };

    let hero;
    let work;
    const layout = () => {
        dpr = Math.min(devicePixelRatio || 1, 2);
        canvas.width = stage.clientWidth * dpr;
        canvas.height = stage.clientHeight * dpr;
        const s = stage.getBoundingClientRect();
        const rel = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left - s.left, y: r.top - s.top, w: r.width };
        };
        hero = rel(heroSlot);
        work = rel(workSlot);
        heroPitch = hero.w / grid.hc;
        workPitch = work.w / grid.wc;
        sprites.clear(); // 尺寸變了，舊的豆子圖不能用
    };

    const progress = () => clamp01(-run.getBoundingClientRect().top / (run.offsetHeight - stage.offsetHeight));

    // 每幀畫幾千個圓太慢（降速 4 倍只有 11fps）→ 每種顏色只畫一次，之後貼圖
    // 顏色取 16 階，顏色種類有限，快取才不會無限長大
    const sprites = new Map();
    const sprite = (r, g, b) => {
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        let s = sprites.get(key);
        if (s) return s;
        const size = Math.ceil(Math.max(heroPitch, workPitch) * 0.94 * dpr);
        s = document.createElement("canvas");
        s.width = s.height = size;
        const c = s.getContext("2d");
        c.fillStyle = `rgb(${(r >> 4) * 17},${(g >> 4) * 17},${(b >> 4) * 17})`;
        c.beginPath();
        c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        c.moveTo(size * 0.67, size / 2);
        c.arc(size / 2, size / 2, size * 0.17, 0, Math.PI * 2);
        c.fill("evenodd"); // 內外兩個圓用 evenodd → 中間挖洞，就是拼豆的樣子
        sprites.set(key, s);
        return s;
    };

    let introStart = 0;
    const INTRO = 1100;

    const draw = (now) => {
        const p = progress();
        const intro = introStart ? clamp01((now - introStart) / INTRO) : 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);

        for (const b of beads) {
            // 每顆豆子出發時間不同，看起來才是散開而不是整片平移
            const t = easeInOut(clamp01((p - 0.08 - b.delay * 0.42) / 0.42));
            const fall = intro < 1 ? easeOut(clamp01((intro - b.delay * 0.55) / 0.45)) : 1;
            if (fall <= 0) continue;
            const hx = hero.x + (b.hx + 0.5) * heroPitch;
            const hy = hero.y + (b.hy + 0.5) * heroPitch;
            const x = lerp(hx, work.x + (b.wx + 0.5) * workPitch, t);
            const y = lerp(hy, work.y + (b.wy + 0.5) * workPitch, t) - (1 - fall) * (hy + 40);
            const r = lerp(heroPitch, workPitch, t) * 0.47;
            const img = sprite(lerp(b.hc[0], b.wc[0], t), lerp(b.hc[1], b.wc[1], t), lerp(b.hc[2], b.wc[2], t));
            ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
        }

        heroPanel.style.opacity = 1 - clamp01(p / 0.14);
        hint.style.opacity = p > 0 ? 0 : 1;
        workPanel.style.opacity = clamp01((p - 0.62) / 0.15);
        workImg.style.opacity = clamp01((p - 0.92) / 0.07); // 拼完才換成清晰的真實截圖

        if (intro < 1) requestAnimationFrame(draw);
    };

    let queued = false;
    const request = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame((now) => {
            queued = false;
            draw(now);
        });
    };

    try {
        await Promise.all([heroImg.decode(), workImg.decode()]);
        build();
        layout();
    } catch (error) {
        root.classList.remove("scrub"); // 圖片讀不到（例如 file:// 開啟）→ 退回靜態版
        return;
    }

    addEventListener("scroll", request, { passive: true });
    addEventListener("resize", () => {
        // 手機網址列收合只改高度，不重建，豆子才不會重新洗牌
        if (innerWidth !== lastWidth) {
            lastWidth = innerWidth;
            build();
        }
        layout();
        request();
    });
    lastWidth = innerWidth;

    if (progress() === 0) introStart = performance.now(); // 重新整理停在中段時不播開場
    requestAnimationFrame(draw);
})();

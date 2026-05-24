/**
 * Arcana Fusion — 前端交互逻辑
 *
 * 控制四个视图的切换：编辑器 → 牌桌 → 解读 → 历史
 * 中英双语切换贯穿所有视图
 */
document.addEventListener("DOMContentLoaded", () => {

    // ============================================================
    // 状态
    // ============================================================
    const state = {
        lang: "zh",                   // "zh" | "en"
        currentView: "editor",        // editor | table | reading | history
        lenormandCards: [],           // 当前抽到的3张雷诺曼
        tarotCards: [],               // 当前抽到的3张塔罗
        seed: null,                   // 随机种子
        flippedCount: 0,              // 已翻牌数
        interpretation: null,         // 解读文本
        savedId: null,                // 保存后的记录ID
        isGenerating: false,          // 是否正在生成解读
    };

    // ============================================================
    // DOM 引用
    // ============================================================
    const $ = (id) => document.getElementById(id);
    const views = {
        editor:  $("view-editor"),
        shuffle: $("view-shuffling"),
        table:   $("view-table"),
        reading: $("view-reading"),
        history: $("view-history"),
    };

    const guidingText   = $("guiding-text");
    const questionInput = $("question-input");
    const btnShuffle    = $("btn-shuffle");
    const btnLangEditor = $("btn-lang-editor");
    const btnSkipShuffle = $("btn-skip-shuffle");

    const tableQuestion  = $("table-question");
    const btnLangTable   = $("btn-lang-table");
    const lenormandRow   = $("lenormand-row");
    const tarotRow       = $("tarot-row");
    const btnBackEditor  = $("btn-back-editor");
    const btnReshuffle   = $("btn-reshuffle");
    const btnToReading   = $("btn-to-reading");

    const readingQuestion   = $("reading-question");
    const readingMeta       = $("reading-meta");
    const readingContent    = $("reading-content");
    const readingCardsMini  = $("reading-cards-mini");
    const btnLangReading    = $("btn-lang-reading");
    const btnSave           = $("btn-save");
    const btnShare          = $("btn-share");
    const btnShowHistory    = $("btn-show-history");
    const btnNewReading     = $("btn-new-reading");

    const historyList       = $("history-list");
    const btnCloseHistory   = $("btn-close-history");

    const cardModal         = $("card-modal");
    const shareModal        = $("share-modal");
    const toast             = $("toast");

    // ============================================================
    // 工具函数
    // ============================================================

    function switchView(name) {
        Object.keys(views).forEach(k => {
            views[k].classList.toggle("active", k === name);
        });
        state.currentView = name;
    }

    function getLang() { return state.lang; }

    function toggleLang() {
        state.lang = state.lang === "zh" ? "en" : "zh";
        return state.lang;
    }

    function updateLangButtons() {
        const langUpper = state.lang === "zh" ? "EN" : "中文";
        [btnLangEditor, btnLangTable, btnLangReading].forEach(btn => {
            if (btn) btn.textContent = langUpper;
        });
    }

    function showToast(msg, duration = 2500) {
        toast.textContent = msg;
        toast.classList.add("show");
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.remove("show"), duration);
    }

    // ============================================================
    // 视图1：编辑器
    // ============================================================

    // 监听输入，控制引导文字显隐和洗牌按钮状态
    questionInput.addEventListener("input", () => {
        const hasText = questionInput.value.trim().length > 0;
        guidingText.classList.toggle("hidden", hasText);
        btnShuffle.disabled = !hasText;
    });

    // 自动调整高度
    questionInput.addEventListener("input", () => {
        questionInput.style.height = "auto";
        questionInput.style.height = questionInput.scrollHeight + "px";
    });

    // 语言切换（编辑器）：引导文字本来就是双语同时显示的，无需额外操作
    btnLangEditor.addEventListener("click", () => {
        toggleLang();
        updateLangButtons();
    });

    // 洗牌按钮：进入洗牌动画
    btnShuffle.addEventListener("click", startShuffle);

    // ============================================================
    // 洗牌动画 → 请求后端 → 进入牌桌
    // ============================================================

    function startShuffle() {
        switchView("shuffle");
        let skipTimer = setTimeout(() => {
            doShuffle();
        }, 2000); // 默认动画2秒后自动完成

        btnSkipShuffle.onclick = () => {
            clearTimeout(skipTimer);
            doShuffle();
        };
    }

    async function doShuffle() {
        try {
            const resp = await fetch("/api/shuffle", { method: "POST" });
            const data = await resp.json();
            state.lenormandCards = data.lenormand;
            state.tarotCards = data.tarot;
            state.seed = data.seed;
            state.flippedCount = 0;
            state.interpretation = null;
            state.savedId = null;

            renderCardTable();
            switchView("table");
        } catch (err) {
            showToast("洗牌失败，请重试 · Shuffle failed");
            switchView("editor");
        }
    }

    // ============================================================
    // 视图2：牌桌
    // ============================================================

    function renderCardTable() {
        // 显示问题
        const q = questionInput.value.trim();
        tableQuestion.textContent = state.lang === "zh" ? `"${q}"` : `"${q}"`;

        // 渲染雷诺曼（3张牌背）
        renderCardSlots(lenormandRow, state.lenormandCards, "lenormand");
        // 渲染塔罗（3张牌背）
        renderCardSlots(tarotRow, state.tarotCards, "tarot");

        btnToReading.disabled = true;
        state.flippedCount = 0;

        // 重新绑定翻牌事件
        document.querySelectorAll(".card-slot").forEach(slot => {
            slot.addEventListener("click", () => flipCard(slot));
        });
    }

    function renderCardSlots(row, cards, system) {
        row.innerHTML = "";
        cards.forEach((card, idx) => {
            // 为每张牌选一个占位符号（未来可替换为真实图片）
            const symbol = getCardSymbol(card, system);

            const container = document.createElement("div");
            container.className = "card-wrapper-container";

            const slot = document.createElement("div");
            slot.className = "card-slot";
            slot.dataset.index = idx;
            slot.dataset.system = system;

            slot.innerHTML = `
                <div class="card-wrapper">
                    <div class="card-back">
                        <div class="card-back-design"></div>
                    </div>
                    <div class="card-face${card.is_reversed ? " reversed" : ""}">
                        <div class="card-inner">
                            <div class="card-face-symbol">${symbol}</div>
                            <div class="card-face-id">#${card.id}</div>
                        </div>
                    </div>
                </div>
            `;

            // 牌下方的名称和含义（始终可见）
            const infoBelow = document.createElement("div");
            infoBelow.className = "card-info-below";
            infoBelow.innerHTML = `
                <div class="card-info-name">
                    <span class="card-info-zh">${card.name_zh}</span>
                    <span class="card-info-en">${card.name_en}</span>
                    ${card.is_reversed ? '<span class="card-info-rev">↕逆位</span>' : ''}
                </div>
                <div class="card-info-keywords">${state.lang === "zh" ? card.keywords_zh : card.keywords_en}</div>
            `;

            // 双击查看详情
            slot.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                showCardDetail(card, system);
            });

            container.appendChild(slot);
            container.appendChild(infoBelow);
            row.appendChild(container);
        });
    }

    // 为每张牌分配一个占位符号（后续可替换为真实牌面图片）
    function getCardSymbol(card, system) {
        if (system === "lenormand") {
            const symbols = {
                1: "🏇", 2: "🍀", 3: "⛵", 4: "🏠", 5: "🌳", 6: "☁️",
                7: "🐍", 8: "⚰️", 9: "💐", 10: "🪓", 11: "🔗", 12: "🐦",
                13: "👶", 14: "🦊", 15: "🐻", 16: "⭐", 17: "🕊️", 18: "🐕",
                19: "🏗️", 20: "🌿", 21: "⛰️", 22: "🔀", 23: "🐭", 24: "❤️",
                25: "💍", 26: "📖", 27: "✉️", 28: "👨", 29: "👩", 30: "⚜️",
                31: "☀️", 32: "🌙", 33: "🔑", 34: "🐟", 35: "⚓", 36: "✝️"
            };
            return symbols[card.id] || "✦";
        } else {
            // 塔罗根据牌组分配符号
            if (card.id <= 21) return "🌟";  // 大阿尔卡纳
            if (card.id <= 35) return "🔥";  // 权杖
            if (card.id <= 49) return "💧";  // 圣杯
            if (card.id <= 63) return "💨";  // 宝剑
            return "🌍";  // 星币
        }
    }

    function flipCard(slot) {
        if (slot.classList.contains("flipped")) return;
        slot.classList.add("flipped");
        state.flippedCount++;

        // 所有牌翻转后启用"查看解读"按钮
        if (state.flippedCount >= 6) {
            btnToReading.disabled = false;
            showToast("所有牌已翻开 · All cards revealed");
        }
    }

    // 重写
    btnBackEditor.addEventListener("click", () => {
        switchView("editor");
        questionInput.focus();
    });

    // 重洗
    btnReshuffle.addEventListener("click", startShuffle);

    // 查看解读
    btnToReading.addEventListener("click", generateReading);

    // 牌桌语言切换
    btnLangTable.addEventListener("click", () => {
        toggleLang();
        updateLangButtons();
        // 重新渲染牌面文字
        renderCardTable();
    });

    // ============================================================
    // 视图3：AI解读
    // ============================================================

    async function generateReading() {
        if (state.isGenerating) return;
        state.isGenerating = true;
        btnToReading.disabled = true;

        switchView("reading");

        const q = questionInput.value.trim();
        readingQuestion.textContent = state.lang === "zh" ? `"${q}"` : `"${q}"`;
        readingMeta.textContent = state.lang === "zh"
            ? `雷诺曼 × 塔罗 · ${new Date().toLocaleString("zh-CN")}`
            : `Lenormand × Tarot · ${new Date().toLocaleString("en-US")}`;

        // 显示迷你牌
        renderMiniCards();

        // 显示加载动画
        readingContent.innerHTML = `
            <div class="reading-loading">
                <div class="loading-spinner">✦</div>
                <p>${state.lang === "zh" ? "解读生成中 · 请稍候..." : "Generating your reading..."}</p>
            </div>
        `;

        try {
            const payload = {
                question_zh: q,
                question_en: q,
                lang: state.lang,
                lenormand: state.lenormandCards,
                tarot: state.tarotCards,
                seed: state.seed,
            };

            const resp = await fetch("/api/reading", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            state.interpretation = data.text;

            // 解析解读文本并渲染
            renderInterpretation(data.text);
        } catch (err) {
            readingContent.innerHTML = `
                <div class="reading-loading">
                    <p style="color:#c44;">${state.lang === "zh" ? "解读生成失败，请重试" : "Failed to generate reading"}</p>
                    <button class="secondary-btn" onclick="document.getElementById('btn-to-reading').click()">
                        ${state.lang === "zh" ? "重试" : "Retry"}
                    </button>
                </div>
            `;
        } finally {
            state.isGenerating = false;
        }
    }

    function renderMiniCards() {
        readingCardsMini.innerHTML = "";
        const allCards = [
            ...state.lenormandCards.map(c => ({...c, _system: "lenormand"})),
            ...state.tarotCards.map(c => ({...c, _system: "tarot"})),
        ];
        allCards.forEach(card => {
            const el = document.createElement("div");
            el.className = `mini-card ${card._system}-mini`;
            el.textContent = state.lang === "zh" ? card.name_zh : card.name_en;
            el.addEventListener("click", () => showCardDetail(card, card._system));
            readingCardsMini.appendChild(el);
        });
    }

    function renderInterpretation(text) {
        // 尝试按标题分割
        const sections = splitIntoSections(text);

        let html = "";
        sections.forEach(s => {
            const cls = s.type === "lenormand" ? "lenormand-section" :
                        s.type === "tarot" ? "tarot-section" : "fusion-section";
            html += `
                <div class="reading-section ${cls}">
                    <h3>${s.title}</h3>
                    <p>${s.body}</p>
                </div>
            `;
        });

        readingContent.innerHTML = html;
    }

    function splitIntoSections(text) {
        // 尝试匹配中英文标题模式
        const patterns = [
            // 英文模式
            { regex: /━━━\s*External Circumstances\s*[·•]\s*LENORMAND\s*━━━/i, type: "lenormand" },
            { regex: /━━━\s*Inner Dynamics\s*[·•]\s*TAROT\s*━━━/i, type: "tarot" },
            { regex: /━━━\s*The Crossroads\s*[·•]\s*FUSION\s*━━━/i, type: "fusion" },
            // 中文模式
            { regex: /━━━\s*外在境况\s*[·•]\s*雷诺曼\s*━━━/i, type: "lenormand" },
            { regex: /━━━\s*内在动因\s*[·•]\s*塔罗\s*━━━/i, type: "tarot" },
            { regex: /━━━\s*内外交织\s*[·•]\s*融合\s*━━━/i, type: "fusion" },
        ];

        // 找标题位置
        let sections = [];
        let remaining = text;

        // 先用第一个匹配的标题分割
        let firstMatch = null;
        let firstIdx = -1;
        patterns.forEach((p, pi) => {
            const m = remaining.match(p.regex);
            if (m && (firstIdx === -1 || m.index < firstIdx)) {
                firstMatch = p;
                firstIdx = m.index;
            }
        });

        if (firstMatch === null) {
            // 没找到标题模式，整段作为融合解读
            return [{ type: "fusion", title: "✦ 解读 · Reading", body: text }];
        }

        // 按所有标题拆分
        const titles = patterns.map(p => p.regex.source).join("|");
        const fullPattern = new RegExp(`(━━━\\s*(?:外在境况|内在动因|内外交织|External Circumstances|Inner Dynamics|The Crossroads)\\s*[·•]\\s*(?:雷诺曼|塔罗|融合|LENORMAND|TAROT|FUSION)\\s*━━━)`, "i");
        const parts = text.split(fullPattern);

        let currentType = "fusion";
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;

            // 检查是否是标题
            let matched = false;
            for (const p of patterns) {
                if (p.regex.test(part)) {
                    currentType = p.type;
                    matched = true;
                    break;
                }
            }
            if (matched) continue;

            // 根据当前标题确定类型
            let title = "";
            switch (currentType) {
                case "lenormand": title = state.lang === "zh" ? "外在境况 · 雷诺曼" : "External Circumstances · LENORMAND"; break;
                case "tarot":     title = state.lang === "zh" ? "内在动因 · 塔罗"     : "Inner Dynamics · TAROT"; break;
                case "fusion":    title = state.lang === "zh" ? "内外交织 · 融合"     : "The Crossroads · FUSION"; break;
            }
            sections.push({ type: currentType, title, body: part });
        }

        // 如果没有成功分割，当一段处理
        if (sections.length === 0) {
            sections.push({ type: "fusion", title: "✦ 解读 · Reading", body: text });
        }

        return sections;
    }

    // 语言切换（解读）
    btnLangReading.addEventListener("click", () => {
        toggleLang();
        updateLangButtons();
        // 重新生成解读
        generateReading();
    });

    // ============================================================
    // 保存
    // ============================================================

    btnSave.addEventListener("click", async () => {
        if (state.savedId) {
            showToast(state.lang === "zh" ? "已保存 · Already saved" : "Already saved");
            return;
        }

        const payload = {
            question_zh: questionInput.value.trim(),
            question_en: questionInput.value.trim(),
            lenormand_ids: state.lenormandCards.map(c => c.id),
            tarot_ids: state.tarotCards.map(c => c.id),
            reversed_flags: state.tarotCards.map(c => c.is_reversed || false),
            seed: state.seed,
            interpretation: {
                full: state.interpretation,
            },
        };

        try {
            const resp = await fetch("/api/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            state.savedId = data.id;
            showToast(state.lang === "zh" ? "✓ 已记录" : "✓ Saved");
        } catch (err) {
            showToast(state.lang === "zh" ? "保存失败" : "Save failed");
        }
    });

    // ============================================================
    // 分享（图片 + 文本）
    // ============================================================

    btnShare.addEventListener("click", () => {
        // 填充图片分享卡片的内容
        const allCards = [
            ...state.lenormandCards.map(c => ({...c, _s: "lenormand"})),
            ...state.tarotCards.map(c => ({...c, _s: "tarot"})),
        ];

        document.getElementById("share-card-question").textContent =
            state.lang === "zh" ? `"${questionInput.value.trim()}"` : `"${questionInput.value.trim()}"`;

        const shareCardsContainer = document.getElementById("share-card-cards");
        shareCardsContainer.innerHTML = "";
        allCards.forEach(c => {
            const el = document.createElement("div");
            el.className = "share-mini-card";
            el.textContent = state.lang === "zh" ? c.name_zh : c.name_en;
            shareCardsContainer.appendChild(el);
        });

        const quote = extractQuote(state.interpretation || "");
        document.getElementById("share-card-quote").textContent = `"${quote}"`;

        shareModal.classList.add("active");
    });

    function extractQuote(text) {
        const lines = text.split("\n").filter(l => l.trim().length > 10 && !l.includes("━━━"));
        return lines.length > 0 ? lines[0].trim().slice(0, 80) : "在牌中看见全貌";
    }

    document.querySelectorAll(".modal-close, .modal-backdrop").forEach(el => {
        el.addEventListener("click", () => {
            cardModal.classList.remove("active");
            shareModal.classList.remove("active");
        });
    });

    // 保存图片（html2canvas 截图）
    document.getElementById("btn-download-share").addEventListener("click", () => {
        const target = document.getElementById("share-card-image");
        if (typeof html2canvas === "undefined") {
            showToast(state.lang === "zh" ? "图片库加载中，请重试" : "Image library loading, retry");
            return;
        }
        html2canvas(target, {
            scale: 2,
            backgroundColor: null,
            useCORS: true,
        }).then(canvas => {
            const link = document.createElement("a");
            link.download = `arcana-fusion-${Date.now()}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            showToast(state.lang === "zh" ? "✓ 图片已保存" : "✓ Image saved");
        }).catch(() => {
            showToast(state.lang === "zh" ? "图片生成失败" : "Image generation failed");
        });
    });

    // 复制分享文本
    document.getElementById("btn-copy-share").addEventListener("click", () => {
        const text = `Arcana Fusion 塔罗×雷诺曼融合占卜\n\n` +
            `问题：${questionInput.value.trim()}\n\n` +
            `雷诺曼：${state.lenormandCards.map(c => c.name_zh).join(" · ")}\n` +
            `塔罗：${state.tarotCards.map(c => c.name_zh + (c.is_reversed ? "(逆)" : "")).join(" · ")}\n\n` +
            `—— 在牌中看见全貌\narcana-fusion-production.up.railway.app`;

        navigator.clipboard.writeText(text).then(() => {
            showToast(state.lang === "zh" ? "✓ 已复制到剪贴板" : "✓ Copied to clipboard");
        }).catch(() => {
            showToast(state.lang === "zh" ? "复制失败" : "Copy failed");
        });
    });

    // ============================================================
    // 历史记录
    // ============================================================

    btnShowHistory.addEventListener("click", loadHistory);
    btnCloseHistory.addEventListener("click", () => {
        if (state.interpretation) {
            switchView("reading");
        } else {
            switchView("editor");
        }
    });

    async function loadHistory() {
        switchView("history");
        historyList.innerHTML = `<div class="history-empty">${state.lang === "zh" ? "加载中..." : "Loading..."}</div>`;

        try {
            const resp = await fetch("/api/history");
            const data = await resp.json();

            if (data.length === 0) {
                historyList.innerHTML = `<div class="history-empty">${state.lang === "zh" ? "暂无记录 · 开始你的第一次占卜吧" : "No readings yet"}</div>`;
                return;
            }

            historyList.innerHTML = "";
            data.forEach(item => {
                const div = document.createElement("div");
                div.className = "history-item";
                const date = new Date(item.created_at);
                const dateStr = state.lang === "zh"
                    ? date.toLocaleString("zh-CN")
                    : date.toLocaleString("en-US");

                // 获取牌的名字
                const allCardNames = [];
                const lenIds = item.lenormand_ids || [];
                const tarIds = item.tarot_ids || [];

                div.innerHTML = `
                    <div class="history-item-header">
                        <span class="history-item-question">${item.question_zh || "(未记录)"}</span>
                        <span class="history-item-date">${dateStr}</span>
                    </div>
                    <div class="history-item-cards">
                        ${lenIds.map(id => `<span class="history-item-card">◆ ${id}</span>`).join("")}
                        ${tarIds.map((id, i) => `<span class="history-item-card">♠ ${id}${(item.reversed_flags || [])[i] ? "↕" : ""}</span>`).join("")}
                    </div>
                `;

                div.addEventListener("click", () => restoreHistoryItem(item));
                historyList.appendChild(div);
            });
        } catch (err) {
            historyList.innerHTML = `<div class="history-empty">${state.lang === "zh" ? "加载失败" : "Load failed"}</div>`;
        }
    }

    function restoreHistoryItem(item) {
        // 从历史记录恢复一次占卜
        state.savedId = item.id;
        // 查找牌信息（简化处理：只显示ID）
        showToast(state.lang === "zh" ? "已加载历史记录" : "History loaded");
        // 回到编辑器
        switchView("editor");
        questionInput.value = item.question_zh || "";
        questionInput.dispatchEvent(new Event("input"));
    }

    // ============================================================
    // 新的占卜
    // ============================================================

    btnNewReading.addEventListener("click", () => {
        switchView("editor");
        questionInput.value = "";
        questionInput.style.height = "auto";
        guidingText.classList.remove("hidden");
        btnShuffle.disabled = true;
        state.interpretation = null;
        state.savedId = null;
        questionInput.focus();
        // 触发 input 事件恢复状态
        questionInput.dispatchEvent(new Event("input"));
    });

    // ============================================================
    // 牌面详情弹窗
    // ============================================================

    function showCardDetail(card, system) {
        const modal = cardModal;
        modal.querySelector(".modal-card-number").textContent = `#${card.id} · ${system === "lenormand" ? "雷诺曼" : "塔罗"}`;
        modal.querySelector(".modal-card-name-zh").textContent = card.name_zh;
        modal.querySelector(".modal-card-name-en").textContent = card.name_en;
        modal.querySelector(".modal-card-keywords").innerHTML =
            `<strong>${state.lang === "zh" ? "关键词" : "Keywords"}:</strong> ${state.lang === "zh" ? card.keywords_zh : card.keywords_en}` +
            (card.is_reversed ? `<br><em style="color:#c44;">${state.lang === "zh" ? "逆位" : "Reversed"}</em>` : "");
        modal.querySelector(".modal-card-system").textContent = system === "lenormand" ? "◆ 雷诺曼 · 外在" : "♠ 塔罗 · 内在";

        modal.classList.add("active");
    }

    // ============================================================
    // 键盘快捷键
    // ============================================================

    document.addEventListener("keydown", (e) => {
        // Ctrl+Enter 触发洗牌（编辑器）/ 查看解读（牌桌）
        if (e.ctrlKey && e.key === "Enter") {
            if (state.currentView === "editor" && !btnShuffle.disabled) {
                btnShuffle.click();
            } else if (state.currentView === "table" && !btnToReading.disabled) {
                btnToReading.click();
            }
        }
        // Escape 关闭弹窗
        if (e.key === "Escape") {
            cardModal.classList.remove("active");
            shareModal.classList.remove("active");
        }
    });

    // ============================================================
    // 初始化
    // ============================================================

    updateLangButtons();
    questionInput.focus();

    // 设置textarea占位符（中英双语定时切换）
    const placeholders = [
        "今天有什么事让你在意？",
        "What's on your mind today?",
        "写下你的问题...",
        "Write your question...",
    ];
    let pi = 0;
    setInterval(() => {
        if (!questionInput.value.trim()) {
            questionInput.placeholder = placeholders[pi % placeholders.length];
            pi++;
        }
    }, 4000);

    console.log("✨ Arcana Fusion 已加载");
    console.log("📖 快捷键: Ctrl+Enter 触发洗牌/解读");
});

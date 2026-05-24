"""
Arcana Fusion — 塔罗×雷诺曼融合占卜  (Flask 后端)
=================================================
运行方式:  python app.py
浏览器打开: http://127.0.0.1:5000
"""

import os
import sys
# 确保当前目录在模块搜索路径中（解决 embeddable Python 的路径问题）
_app_dir = os.path.dirname(os.path.abspath(__file__))
if _app_dir not in sys.path:
    sys.path.insert(0, _app_dir)

import random
import sqlite3
import json
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from cards import TAROT_CARDS, LENORMAND_CARDS

# ============================================================
# 配置区（修改这里）
# ============================================================

# ---- 选择AI后端 ----
# 可选: "qwen" (通义千问, 推荐), "deepseek", "claude"
AI_BACKEND = "deepseek"

# ---- DeepSeek (推荐 — 国内可用，价格低，中文能力强) ----
# 注册: https://platform.deepseek.com/ → 手机号注册 → API keys → 创建
# Railway 部署时：在 Railway 面板设置环境变量 DEEPSEEK_API_KEY
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY") or "sk-66bf8aea82c24a38b3dce126818d2c47"

# ---- 通义千问 (DashScope) 备选 ----
# 注册: https://dashscope.aliyun.com/
QWEN_API_KEY = "你的通义千问API密钥"

# ---- Claude API (国外) ----
CLAUDE_API_KEY = os.environ.get("CLAUDE_API_KEY", "")

# ============================================================
# Flask 初始化
# ============================================================

app = Flask(__name__)
app.config["SECRET_KEY"] = "arcana-fusion-secret-key"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tarot.db")


# ============================================================
# 数据库（SQLite）—— 存历史记录
# ============================================================

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS readings (
            id TEXT PRIMARY KEY,
            created_at TEXT,
            question_zh TEXT,
            question_en TEXT,
            lenormand_ids TEXT,
            tarot_ids TEXT,
            reversed_flags TEXT,
            seed INTEGER,
            interpretation TEXT
        )
    """)
    conn.commit()
    conn.close()

def save_reading(data):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO readings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            data["id"], data["created_at"], data["question_zh"],
            data["question_en"], json.dumps(data["lenormand_ids"]),
            json.dumps(data["tarot_ids"]), json.dumps(data["reversed_flags"]),
            data["seed"], json.dumps(data["interpretation"])
        )
    )
    conn.commit()
    conn.close()

def get_history(limit=50):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM readings ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        item = dict(row)
        item["lenormand_ids"] = json.loads(item["lenormand_ids"])
        item["tarot_ids"] = json.loads(item["tarot_ids"])
        item["reversed_flags"] = json.loads(item["reversed_flags"])
        item["interpretation"] = json.loads(item["interpretation"])
        result.append(item)
    return result


# ============================================================
# AI 解读生成（核心功能）
# ============================================================

def build_prompt(question, cards_data, lang="zh"):
    """
    构建发送给 AI 的提示词。
    cards_data: {
        "lenormand": [ (card, position), ... ],
        "tarot": [ (card, position, is_reversed), ... ]
    }
    """
    if lang == "zh":
        lenormand_section = "\n".join([
            f"  位置{i+1}：{c['name_zh']}（{c['name_en']}）— {c['keywords_zh']}"
            for i, (c, _) in enumerate(cards_data["lenormand"])
        ])
        tarot_section = "\n".join([
            f"  位置{i+1}：{c['name_zh']}（{c['name_en']}）{'（逆位）' if rev else '（正位）'}— {c['keywords_zh']}"
            for i, (c, _, rev) in enumerate(cards_data["tarot"])
        ])
    else:
        lenormand_section = "\n".join([
            f"  Position {i+1}: {c['name_en']} ({c['name_zh']}) — {c['keywords_en']}"
            for i, (c, _) in enumerate(cards_data["lenormand"])
        ])
        tarot_section = "\n".join([
            f"  Position {i+1}: {c['name_en']} ({c['name_zh']}) {'(REVERSED)' if rev else '(UPRIGHT)'} — {c['keywords_en']}"
            for i, (c, _, rev) in enumerate(cards_data["tarot"])
        ])

    if lang == "zh":
        return f"""你是一位精通塔罗与雷诺曼的占卜解读师。你的解读风格是：直白而不失深度，洞察而不说教。你擅长将牌面象征与提问者的具体处境紧密结合。

用户的提问："{question}"

你将基于以下6张牌做融合解读：

【雷诺曼 — 外在境况】—— 请用直白、务实、预测的口吻
{lenormand_section}

【塔罗 — 内在动因】—— 请用探索、心理洞察的口吻
{tarot_section}

解读规则（必须遵守）：
1️⃣ 必须紧密围绕用户的具体问题，拒绝任何泛泛而谈
2️⃣ 如果问题涉及其他人（如感情关系中的对方），必须同时解读 TA 的状态和双方的互动，不能只讲提问者自己
3️⃣ 雷诺曼部分侧重"会发生什么"——描述具体事件走向、他人行为、环境变化，要有预测性
4️⃣ 塔罗部分侧重"内在正在经历什么"——挖掘双方的情感动机、心理模式、关系中的深层动力
5️⃣ 融合部分把内外联系起来——指出内在状态将如何影响外在发展，以及外在事件又将如何触动内心
6️⃣ 不要用"你需要选择/你应该"这种说教口吻，而是描述客观的局面和可能的走向

请严格按照以下格式输出（用中文）：

━━━ 外在境况 · 雷诺曼 ━━━
（300-500字，描述客观局势和预测，务必涉及问题中提到的其他人物或因素）

━━━ 内在动因 · 塔罗 ━━━
（300-500字，挖掘心理层面的动因，包括提问者和相关方的内在状态）

━━━ 内外交织 · 融合 ━━━
（200-300字，交叉映射内外信息，指出事件可能的走向）
"""
    else:
        return f"""You are a skilled Tarot and Lenormand reader. Your style is direct yet insightful. You always connect the cards' symbolism tightly to the querent's specific situation.

The querent's question: "{question}"

You will interpret 6 cards across two systems:

【LENORMAND — External Circumstances】— Direct, grounded, predictive
{lenormand_section}

【TAROT — Inner Dynamics】— Exploratory, psychologically insightful
{tarot_section}

Rules (must follow):
1️⃣ Your interpretation MUST closely reference the querent's specific question — no generic statements
2️⃣ If the question involves other people (e.g. a partner in a relationship), you MUST discuss their state and the dynamics between both parties, not just the querent
3️⃣ Lenormand section focuses on "what will happen" — concrete events, other people's actions, environmental changes, predictions
4️⃣ Tarot section focuses on "what's happening within" — emotional motivations, psychological patterns, deep dynamics (of all parties involved)
5️⃣ The fusion section connects inner and outer — how inner states may shape external outcomes, and how events may affect inner emotions
6️⃣ Do NOT use a preachy "you should/you need to" tone. Describe the situation objectively and the likely direction of events.

Output format:

━━━ External Circumstances · LENORMAND ━━━
(300-500 words — objective situation analysis and prediction, MUST include other people/entities mentioned in the question)

━━━ Inner Dynamics · TAROT ━━━
(300-500 words — psychological exploration of all parties involved, not just the querent)

━━━ The Crossroads · FUSION ━━━
(200-300 words — cross-reference inner and outer, point to likely direction of events)
"""


def call_ai(prompt):
    """根据 AI_BACKEND 配置调用对应的 AI 服务"""
    if AI_BACKEND == "qwen":
        return call_qwen(prompt)
    elif AI_BACKEND == "deepseek":
        return call_deepseek(prompt)
    else:
        return call_claude(prompt)


def call_qwen(prompt):
    """调用通义千问 (DashScope) — 推荐国内用户使用"""
    try:
        import requests
        headers = {
            "Authorization": f"Bearer {QWEN_API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "qwen-plus",  # qwen-turbo 更便宜, qwen-plus 质量更好
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 2000,
            "temperature": 0.8
        }
        resp = requests.post(
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            headers=headers, json=data, timeout=60
        )
        result = resp.json()
        if "choices" in result:
            return result["choices"][0]["message"]["content"]
        else:
            return f"[通义千问返回异常] {str(result)}"
    except Exception as e:
        return f"[通义千问调用失败] {str(e)}\n\n👉 请检查 app.py 中的 QWEN_API_KEY 是否正确"


def call_deepseek(prompt):
    """调用 DeepSeek API — 国内备选方案"""
    try:
        import requests
        headers = {
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "deepseek-chat",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 2000,
            "temperature": 0.8
        }
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers=headers, json=data, timeout=60
        )
        result = resp.json()
        if "choices" in result:
            return result["choices"][0]["message"]["content"]
        else:
            return f"[DeepSeek返回异常] {str(result)}"
    except Exception as e:
        return f"[DeepSeek调用失败] {str(e)}\n\n👉 请检查 app.py 中的 DEEPSEEK_API_KEY 是否正确"


def call_claude(prompt):
    """调用 Claude API（国外，国内需要特殊网络环境）"""
    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=CLAUDE_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            temperature=0.7,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text
    except Exception as e:
        return f"[Claude调用失败] {str(e)}"


# ============================================================
# 辅助函数
# ============================================================

def shuffle_cards():
    """随机选3张雷诺曼 + 3张塔罗（含正逆位），返回牌数据和种子"""
    seed = random.randint(0, 999999)
    rng = random.Random(seed)

    lenormand_picked = rng.sample(LENORMAND_CARDS, 3)
    tarot_picked = rng.sample(TAROT_CARDS, 3)
    reversed_flags = [rng.random() < 0.5 for _ in range(3)]

    return {
        "lenormand": [{"id": c["id"], "name_zh": c["name_zh"], "name_en": c["name_en"],
                        "keywords_zh": c["keywords_zh"], "keywords_en": c["keywords_en"]}
                       for c in lenormand_picked],
        "tarot": [{"id": c["id"], "name_zh": c["name_zh"], "name_en": c["name_en"],
                    "keywords_zh": c["keywords_zh"], "keywords_en": c["keywords_en"],
                    "is_reversed": rev}
                   for c, rev in zip(tarot_picked, reversed_flags)],
        "seed": seed
    }


def get_card_info(system, card_id):
    """根据体系和编号查找牌信息"""
    if system == "tarot":
        for c in TAROT_CARDS:
            if c["id"] == card_id:
                return c
    else:
        for c in LENORMAND_CARDS:
            if c["id"] == card_id:
                return c
    return None


# ============================================================
# 路由
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/shuffle", methods=["POST"])
def api_shuffle():
    """洗牌：返回3张雷诺曼 + 3张塔罗"""
    result = shuffle_cards()
    return jsonify(result)


@app.route("/api/reading", methods=["POST"])
def api_reading():
    """
    生成AI解读。
    请求体: { "question_zh": "...", "question_en": "...", "lang": "zh"/"en",
               "lenormand": [...], "tarot": [...], "seed": 123 }
    """
    data = request.get_json()
    lang = data.get("lang", "zh")
    question = data.get("question_zh" if lang == "zh" else "question_en", "")
    lenormand_data = data.get("lenormand", [])
    tarot_data = data.get("tarot", [])

    # 整理成 prompt 需要的格式
    cards_for_prompt = {
        "lenormand": [(get_card_info("lenormand", c["id"]), i)
                      for i, c in enumerate(lenormand_data)],
        "tarot": [(get_card_info("tarot", c["id"]), i, c.get("is_reversed", False))
                  for i, c in enumerate(tarot_data)]
    }

    prompt = build_prompt(question, cards_for_prompt, lang)
    interpretation = call_ai(prompt)
    return jsonify({"text": interpretation})


@app.route("/api/save", methods=["POST"])
def api_save():
    """保存一次占卜记录"""
    data = request.get_json()
    data["id"] = datetime.now().strftime("%Y%m%d%H%M%S%f")
    data["created_at"] = datetime.now().isoformat()
    save_reading(data)
    return jsonify({"status": "ok", "id": data["id"]})


@app.route("/api/history", methods=["GET"])
def api_history():
    """获取历史记录"""
    history = get_history()
    return jsonify(history)


@app.route("/api/cards/<system>/<int:card_id>")
def api_card_detail(system, card_id):
    """获取单张牌的详细信息"""
    card = get_card_info(system, card_id)
    if card:
        return jsonify(card)
    return jsonify({"error": "card not found"}), 404


# ============================================================
# 启动
# ============================================================

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") == "development"
    print(f"[Arcana Fusion] Server started on port {port}!")
    if not debug:
        print(f"[Arcana Fusion] Open http://0.0.0.0:{port} in your browser")
    print("[Arcana Fusion] Press Ctrl+C to stop")
    app.run(host="0.0.0.0", port=port, debug=debug)

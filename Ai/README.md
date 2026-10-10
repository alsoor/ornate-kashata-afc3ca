# Stooorna Ai — وحدة مستقلة بالكامل

كل شيء المتعلق بالـ AI موجود داخل مجلد **`Ai/`** فقط.  
لا يعتمد على باقي المشروع إلا عبر HTTP + مكوّنات الواجهة.

```
Ai/
├── frontend/          # React: أيقونة الشريط + نافذة الدردشة
├── backend/           # FastAPI + LangChain + Vector DB
├── docker/            # Dockerfile + docker-compose
├── docs/              # دليل الدمج مع Stooorna
├── data/              # Chroma / uploads / HF cache (محلي)
├── .vscode/           # إعدادات VS Code / Cursor
├── .env.example
└── README.md
```

---

## الأدوات المدمجة

| الأداة | الاستخدام داخل Ai |
|--------|-------------------|
| **VS Code / Cursor** | `.vscode/` — تشغيل وتصحيح الـ API بضغطة |
| **FastAPI** | `backend/app` — واجهة REST مستقلة |
| **Docker** | `docker/` — تشغيل الخدمة بحاوية |
| **OpenAI API** | دردشة + embeddings |
| **Gemini API** | دردشة عبر Google Generative AI |
| **Ollama** | نماذج محلية (افتراضي للتطوير) |
| **LangChain** | جاهز في المتطلبات — توسعة سلاسل لاحقاً |
| **LlamaIndex** | جاهز في المتطلبات — فهرسة مستندات |
| **Pinecone / ChromaDB** | تخزين متجهات (RAG) |
| **Hugging Face** | نماذج/embeddings اختيارية |
| **Pandas / NumPy** | معالجة بيانات داخل الخدمات |
| **PyTorch / TensorFlow** | اختياري — أزل التعليق من `requirements.txt` |

---

## 1) تشغيل سريع (محلي)

### المتطلبات
- Python 3.11+
- (اختياري) [Ollama](https://ollama.com) + نموذج:
  ```bash
  ollama pull llama3.2
  ollama pull nomic-embed-text
  ```

### إعداد
```bash
cd Ai
cp .env.example .env
# عدّل المفاتيح إن لزم (OpenAI / Gemini)

cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
bash scripts/dev.sh
```

افتح: [http://127.0.0.1:8000/ai/docs](http://127.0.0.1:8000/ai/docs)

### Docker
```bash
cd Ai
cp .env.example .env
docker compose -f docker/docker-compose.yml up --build
```

---

## 2) API

| Method | Path | الوصف |
|--------|------|--------|
| GET | `/ai/health` | صحة الخدمة + الأدوات المتاحة |
| POST | `/ai/chat` | دردشة (OpenAI / Gemini / Ollama) |
| POST | `/ai/rag/embed` | إضافة نصوص للمتجر المتجهي |
| POST | `/ai/rag/search` | بحث دلالي |

مثال دردشة:
```bash
curl -s http://127.0.0.1:8000/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"مرحبا، من أنت؟"}'
```

---

## 3) ربط الواجهة بتطبيق Stooorna

1. انسخ `frontend/` → `src/ai/` في مشروع Stooorna  
2. اتبع `docs/FRONTEND_INTEGRATION.md`  
3. (اختياري) عيّن عنوان الـ API:
   - `window.__STOOORNA_AI_API__ = 'http://127.0.0.1:8000/ai'`
   - أو `VITE_STOOORNA_AI_URL` / `NEXT_PUBLIC_STOOORNA_AI_URL`

الترتيب في الشريط السفلي:
```
Call | LIVE | S (Ai) | Templates | Settings
```

---

## 4) اختيار المزود

في `.env`:

```env
# محلي بدون تكلفة
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2

# أو OpenAI
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-...

# أو Gemini
# LLM_PROVIDER=gemini
# GEMINI_API_KEY=...
```

المتاجر المتجهية:
```env
VECTOR_STORE=chroma          # افتراضي محلي
# VECTOR_STORE=pinecone
# PINECONE_API_KEY=...
```

---

## 5) VS Code / Cursor

افتح مجلد `Ai/` كـ workspace:

- **Run & Debug** → `Stooorna Ai API`
- الامتدادات المقترحة في `.vscode/extensions.json`

---

## الاستقلالية

- لا يستورد كود Stooorna من خارج `Ai/`
- الواجهة تتصل بالـ backend عبر HTTP فقط
- البيانات المحلية تحت `Ai/data/`
- يمكن نشر `backend` على سيرفر منفصل لاحقاً

---

**الإصدار:** 1.0.0 · Stooorna Ai

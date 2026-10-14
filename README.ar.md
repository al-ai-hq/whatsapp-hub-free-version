# WhatsApp Hub Free

**رسائل واتساب مستضافة ذاتياً لأعمالك.**

**[English](./README.md)** | **العربية**

<div dir="rtl">

WhatsApp Hub Free منصة رسائل واتساب مستضافة ذاتياً مبنية على **Meta Cloud API**. ارفع جهات الاتصال، أنشئ القوالب، أرسل رسائل جماعية، وأدر المحادثات ثنائية الاتجاه — كل ذلك من بنيتك التحتية الخاصة.

## المميزات

- **بياناتك تبقى تحت سيطرتك** — استضافة ذاتية كاملة، مثالية للامتثال للأنظمة المحلية (السعودية PDPL، الإمارات DPL، الأردن)
- **رفع جهات الاتصال والبث الجماعي** — استورد جهات الاتصال عبر CSV وأرسل رسائل جماعية عبر قوالب معتمدة
- **صندوق وارد ثنائي الاتجاه** — محادثات حية مع تتبع نافذة الخدمة 24 ساعة، يدعم النصوص والصور والمستندات والصوت والفيديو والملصقات والتفاعلات
- **منشئ قوالب غني** — رؤوس وسائط، أكواد كوبونات، شرائط عرض، أزرار تفاعلية (رد سريع / رابط / اتصال / نسخ كود)
- **حملات متكررة** — جدوِل حملات لمرة واحدة أو متكررة بتوقيت UTC
- **تحليلات مفصلة** — قمع التسليم، معدلات القراءة، تتبع أحداث الأزرار
- **إعادة المحاولة للفشل** — أعد جدولة المستلمين الفاشلين فقط من أي بث

## التقنيات المستخدمة

Next.js (App Router) · TypeScript strict · Prisma + PostgreSQL · BullMQ + Redis · Docker Compose

## المتطلبات الأساسية

1. حساب **WhatsApp Business Account (WABA)** من Meta + رقم هاتف
2. **قالب رسالة معتمد** واحد على الأقل
3. **رمز وصول دائم** (System User token) + **App Secret** + **Phone Number ID** + **WABA ID**
4. **PostgreSQL 16+** و **Redis 7+** (متوفرة عبر Docker Compose)

## البداية السريعة (Docker)

```bash
cp .env.example .env                          # املأ WA_* و META_APP_SECRET
node scripts/hash-password.mjs 'YourPassword' # انسخ الناتج → ADMIN_PASSWORD_HASH
#   ضع أيضاً ADMIN_EMAIL و AUTH_JWT_SECRET طويل (>=32 حرف)
docker compose up --build                     # postgres, redis, app (يشغل migrations), worker
```

عند أول تشغيل ستُحوَّل إلى **/login**. سجّل دخول بـ `ADMIN_EMAIL` + كلمة المرور.

- التطبيق: http://localhost:3000
- الصحة: http://localhost:3000/api/health

## التدفق الأساسي

0. **ربط واتساب** — اذهب إلى الإعدادات → ربط واتساب، الصق Phone Number ID و Business Account ID و App ID ورمز الوصول و app secret، ثم **اختبار الاتصال**
1. **مزامنة القوالب:** `GET /api/templates?sync=1`
2. **رفع جهات الاتصال:** `POST /api/contacts/upload` (صيغة CSV)
3. **إنشاء بث جماعي:** `POST /api/broadcasts`
4. **تابع التقدم** في لوحة التحكم. رسائل **STOP** الواردة تلغي الاشتراك تلقائياً

## القوالب

أنشئ قوالب في **/templates** وقدّمها لـ Meta للاعتماد:

- **رأس وسائط** — صورة / PDF / فيديو
- **نص** مع `{{متغيرات}}` + **تذييل** اختياري
- **أزرار** (حتى 3): رد سريع / رابط / **اتصال** / **نسخ كود** (كوبون)
- **شريط عرض** — 2-10 بطاقات وسائط

## الحملات المتكررة

مدعومة بـ `RecurringCampaign` + BullMQ scheduler. الـ worker يعيد مزامنة الجداول النشطة عند الإقلاع. جميع الجداول تعمل بـ **UTC**.

## التطوير المحلي (بدون Docker)

```bash
npm install
npm run prisma:migrate -- --name init
npm run dev          # web على :3000
npm run worker:dev   # worker (طرفية منفصلة)
```

## الاختبارات

```bash
npm run typecheck    # tsc strict
npm test             # vitest
npm run test:e2e     # playwright
```

## النشر

### Railway (نقرة واحدة)

راجع **RAILWAY.md**. 4 مكونات: Postgres, Redis, **web**, **worker**.

### مستضاف ذاتياً (Docker)

```bash
docker compose up --build -d
```

### خيار بدون خادم

شغّل `app` على Vercel؛ Postgres → Neon/Supabase، Redis → Upstash. **الـ worker يجب أن يبقى على مضيف دائم** (Railway/Fly/VM).

## التوسع

- ارفع `WA_MPS` **فقط بعد** ترقية Meta لمستوى الإنتاجية
- شغّل عدة حاويات `worker` — BullMQ يوزع المهام بينها

## إعداد Webhook

في Meta App Dashboard → WhatsApp → Configuration:

- **Callback URL:** `https://YOUR_DOMAIN/api/webhooks/whatsapp`
- **Verify token:** رمز التحقق الخاص بك
- اشترك في أحداث **messages**

## الترخيص

[MIT License](./LICENSE) — مفتوح المصدر، مجاني 100%

</div>

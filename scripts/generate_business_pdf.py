"""
Generate a professional Hebrew PDF: Business Model for the Driving Theory App.
Uses Arial (Windows system font) for Hebrew RTL support + python-bidi.
Output: C:/Users/Yakov/Desktop/driving_theory_business_model.pdf
"""

import os
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Register fonts ────────────────────────────────────────────────────────────
FONTS_DIR = "C:/Windows/Fonts"
pdfmetrics.registerFont(TTFont("Arial",   f"{FONTS_DIR}/arial.ttf"))
pdfmetrics.registerFont(TTFont("ArialBd", f"{FONTS_DIR}/arialbd.ttf"))

# ── RTL helper ────────────────────────────────────────────────────────────────
def r(text: str) -> str:
    """Convert Hebrew/RTL text to visual display order for reportlab."""
    return get_display(text)

# ── Colors ────────────────────────────────────────────────────────────────────
C_NAVY     = colors.HexColor("#1a237e")
C_BLUE     = colors.HexColor("#1565C0")
C_LIGHT    = colors.HexColor("#E3F2FD")
C_GREEN    = colors.HexColor("#2E7D32")
C_LGGREEN  = colors.HexColor("#E8F5E9")
C_ORANGE   = colors.HexColor("#E65100")
C_LORANGE  = colors.HexColor("#FFF3E0")
C_RED      = colors.HexColor("#C62828")
C_LRED     = colors.HexColor("#FFEBEE")
C_PURPLE   = colors.HexColor("#6A1B9A")
C_LPURPLE  = colors.HexColor("#F3E5F5")
C_TEAL     = colors.HexColor("#00695C")
C_LTEAL    = colors.HexColor("#E0F2F1")
C_GOLD     = colors.HexColor("#F57F17")
C_LGOLD    = colors.HexColor("#FFFDE7")
C_GRAY     = colors.HexColor("#607D8B")
C_LGRAY    = colors.HexColor("#F5F5F5")
C_TEXT     = colors.HexColor("#191c1e")
C_SUBTEXT  = colors.HexColor("#404943")
C_WHITE    = colors.white

# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    return {
        "cover_title": ParagraphStyle("cover_title",
            fontName="ArialBd", fontSize=28, textColor=C_WHITE,
            alignment=TA_CENTER, spaceAfter=8, leading=38),

        "cover_sub": ParagraphStyle("cover_sub",
            fontName="Arial", fontSize=15, textColor=C_LIGHT,
            alignment=TA_CENTER, spaceAfter=6, leading=22),

        "cover_note": ParagraphStyle("cover_note",
            fontName="Arial", fontSize=11, textColor=C_LIGHT,
            alignment=TA_CENTER, spaceAfter=4, leading=16),

        "section_title": ParagraphStyle("section_title",
            fontName="ArialBd", fontSize=18, textColor=C_NAVY,
            alignment=TA_RIGHT, spaceBefore=14, spaceAfter=8, leading=26),

        "country_title": ParagraphStyle("country_title",
            fontName="ArialBd", fontSize=14, textColor=C_WHITE,
            alignment=TA_RIGHT, spaceAfter=4, leading=20),

        "body": ParagraphStyle("body",
            fontName="Arial", fontSize=11, textColor=C_TEXT,
            alignment=TA_RIGHT, spaceAfter=4, leading=18),

        "body_bold": ParagraphStyle("body_bold",
            fontName="ArialBd", fontSize=11, textColor=C_TEXT,
            alignment=TA_RIGHT, spaceAfter=4, leading=18),

        "bullet": ParagraphStyle("bullet",
            fontName="Arial", fontSize=10, textColor=C_TEXT,
            alignment=TA_RIGHT, spaceAfter=3, leading=16,
            leftIndent=0, rightIndent=10, bulletIndent=0),

        "table_header": ParagraphStyle("table_header",
            fontName="ArialBd", fontSize=10, textColor=C_WHITE,
            alignment=TA_CENTER, leading=14),

        "table_cell": ParagraphStyle("table_cell",
            fontName="Arial", fontSize=9, textColor=C_TEXT,
            alignment=TA_RIGHT, leading=13),

        "table_cell_bold": ParagraphStyle("table_cell_bold",
            fontName="ArialBd", fontSize=9, textColor=C_TEXT,
            alignment=TA_RIGHT, leading=13),

        "highlight_box": ParagraphStyle("highlight_box",
            fontName="ArialBd", fontSize=11, textColor=C_NAVY,
            alignment=TA_CENTER, spaceAfter=4, leading=17),

        "footer": ParagraphStyle("footer",
            fontName="Arial", fontSize=8, textColor=C_GRAY,
            alignment=TA_CENTER, leading=12),
    }

# ── Table helper ──────────────────────────────────────────────────────────────
def make_table(rows, col_widths, header_color=C_BLUE, row_colors=None):
    S = make_styles()
    table_rows = []
    for i, row in enumerate(rows):
        table_rows.append([
            Paragraph(r(cell), S["table_header"] if i == 0 else S["table_cell"])
            for cell in row
        ])

    style_cmds = [
        ("BACKGROUND",   (0,0), (-1,0), header_color),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), row_colors or [colors.white, C_LGRAY]),
        ("ALIGN",        (0,0), (-1,-1), "CENTER"),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
        ("GRID",         (0,0), (-1,-1), 0.5, colors.HexColor("#dde3ea")),
        ("ROUNDEDCORNERS",[4]),
        ("TOPPADDING",   (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]
    t = Table(table_rows, colWidths=col_widths)
    t.setStyle(TableStyle(style_cmds))
    return t

# ── Country section builder ───────────────────────────────────────────────────
def country_section(story, S, flag, title_he, audience_he, rows, col_widths,
                    header_color, row_colors, note_he=None):
    # Country header bar
    header_table = Table(
        [[Paragraph(r(f"{flag}  {title_he}"), S["country_title"])]],
        colWidths=[170*mm]
    )
    header_table.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,-1), header_color),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING",(0,0), (-1,-1), 12),
        ("TOPPADDING",  (0,0), (-1,-1), 10),
        ("BOTTOMPADDING",(0,0),(-1,-1), 10),
        ("ROUNDEDCORNERS",[6]),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4))
    story.append(Paragraph(r(f"קהל יעד: {audience_he}"), S["body"]))
    story.append(Spacer(1, 5))
    story.append(make_table(rows, col_widths, header_color, row_colors))
    if note_he:
        story.append(Spacer(1, 4))
        note_box = Table(
            [[Paragraph(r(f"  {note_he}"), S["bullet"])]],
            colWidths=[170*mm]
        )
        note_box.setStyle(TableStyle([
            ("BACKGROUND",  (0,0), (-1,-1), colors.HexColor("#FFFDE7")),
            ("LEFTPADDING", (0,0), (-1,-1), 10),
            ("TOPPADDING",  (0,0), (-1,-1), 8),
            ("BOTTOMPADDING",(0,0),(-1,-1), 8),
            ("ROUNDEDCORNERS",[4]),
        ]))
        story.append(note_box)
    story.append(Spacer(1, 14))

# ── Build document ─────────────────────────────────────────────────────────────
def build_pdf():
    output = "C:/Users/Yakov/Desktop/driving_theory_business_model.pdf"
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=20*mm, leftMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
        title="מודל עסקי — אפליקציית תיאוריית הנהיגה"
    )

    S = make_styles()
    story = []
    W = 170*mm  # usable width

    # ══════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ══════════════════════════════════════════════════════════════════════════
    cover = Table(
        [[Paragraph(r("🚗  אפליקציית תיאוריית הנהיגה"), S["cover_title"]),
          Spacer(1,10),
          Paragraph(r("מודל עסקי — כל השווקים הגלובליים"), S["cover_sub"]),
          Spacer(1,6),
          Paragraph(r("ישראל | אירופה | אמריקה | מדינות ערב | אתיופיה"), S["cover_note"]),
          Spacer(1,6),
          Paragraph(r("מסמך אסטרטגי — סודי"), S["cover_note"]),
         ]],
        colWidths=[W]
    )
    cover.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,-1), C_NAVY),
        ("TOPPADDING",  (0,0), (-1,-1), 40),
        ("BOTTOMPADDING",(0,0),(-1,-1), 40),
        ("LEFTPADDING", (0,0), (-1,-1), 20),
        ("RIGHTPADDING",(0,0), (-1,-1), 20),
        ("ROUNDEDCORNERS",[12]),
        ("SPAN",        (0,0), (-1,-1)),
        ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(Spacer(1, 40))
    story.append(cover)
    story.append(Spacer(1, 30))

    # Key numbers highlight boxes
    kpi_data = [[
        Paragraph(r("~250K\nאתיופים בישראל"),      S["highlight_box"]),
        Paragraph(r("~500K\nעובדים במדינות ערב"),   S["highlight_box"]),
        Paragraph(r("~400K\nאתיופים באמריקה"),      S["highlight_box"]),
        Paragraph(r("~200K\nבאירופה"),               S["highlight_box"]),
    ]]
    kpi_table = Table(kpi_data, colWidths=[W/4]*4)
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (0,0), C_LIGHT),
        ("BACKGROUND",   (1,0), (1,0), C_LGGREEN),
        ("BACKGROUND",   (2,0), (2,0), C_LORANGE),
        ("BACKGROUND",   (3,0), (3,0), C_LPURPLE),
        ("TOPPADDING",   (0,0), (-1,-1), 10),
        ("BOTTOMPADDING",(0,0), (-1,-1), 10),
        ("ROUNDEDCORNERS",[6]),
        ("GRID",         (0,0), (-1,-1), 0.5, C_BLUE),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 20))

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 1 — OVERVIEW
    # ══════════════════════════════════════════════════════════════════════════
    story.append(HRFlowable(width=W, color=C_NAVY, thickness=2))
    story.append(Paragraph(r("✦  סקירה כללית"), S["section_title"]))
    story.append(Paragraph(
        r("האפליקציה מיועדת לאוכלוסייה האתיופית הלומדת תיאוריית נהיגה — בישראל ובעולם. "
          "הקהל הוא High-Intent: כל משתמש עומד לרכוש שירות (שיעורי נהיגה, ביטוח, רכב). "
          "ערך פרסומי גבוה מאוד."), S["body"]))
    story.append(Spacer(1, 6))

    priority = make_table(
        [
            ["שלב", "שוק", "פוטנציאל הכנסה חודשי", "קושי יישום"],
            ["א׳ (עכשיו)",     "ישראל",                  "$500–2,000",      "נמוך"],
            ["ב׳ (6 חודשים)", "איחוד האמירויות / ערב",   "$2,000–8,000",    "בינוני"],
            ["ג׳ (שנה)",      "אמריקה + Platform",       "$5,000–20,000",   "גבוה"],
            ["ד׳ (2 שנים)",   "אתיופיה + NGO",           "$1,000–5,000",    "בינוני"],
        ],
        [25*mm, 50*mm, 55*mm, 40*mm], C_NAVY,
        [colors.white, C_LGRAY]
    )
    story.append(priority)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 2 — ISRAEL
    # ══════════════════════════════════════════════════════════════════════════
    story.append(HRFlowable(width=W, color=C_BLUE, thickness=2))
    story.append(Paragraph(r("✦  מודל עסקי לפי שוק"), S["section_title"]))

    country_section(story, S,
        flag="🇮🇱", title_he="ישראל — שוק נוכחי",
        audience_he="עולים אתיופים (~250,000) לומדים לרישיון ישראלי",
        rows=[
            ["ערוץ הכנסה",         "פירוט",                                         "הכנסה חזויה"],
            ["פרסום מורי נהיגה",   "כרטיס + כפתור 'אהנ ידewlu' — תשלום לפי ליד",   "$5–15 לליד"],
            ["ביטוח רכב",          "מנורה, הפניקס, איילון — הפניות בדמי עמלה",      "$50–200 לעסקה"],
            ["Freemium",            "2 נושאים חינם, פרמיום 15-20 ₪/חודש",            "$300–1,500/חודש"],
            ["SaaS בתי ספר",       "דאשבורד התקדמות תלמידים לבתי ספר לנהיגה",       "$50–100/תלמיד"],
            ["מכירי רכב",          "יד2, דילרים — פרסום ממוקד לנהגים חדשים",        "$200–800/חודש"],
            ["מענקים ממשלתיים",    "משרד הקליטה, ג׳וינט — אינטגרציית עולים",        "חד-פעמי $5,000+"],
        ],
        col_widths=[45*mm, 85*mm, 40*mm],
        header_color=C_BLUE, row_colors=[colors.white, C_LIGHT],
        note_he="💡 יתרון: מיקום GPS — מורה נהיגה בתוך 20 ק\"מ בלבד → פרסום פרמיום מדויק"
    )

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 3 — EUROPE
    # ══════════════════════════════════════════════════════════════════════════
    country_section(story, S,
        flag="🇪🇺", title_he="אירופה — שוודיה, גרמניה, בריטניה, הולנד",
        audience_he="קהילה אתיופית ~200,000 — לרוב פליטים ומהגרי עבודה",
        rows=[
            ["ערוץ הכנסה",         "פירוט",                                              "הכנסה חזויה"],
            ["Freemium לפי מדינה", "DVSA (UK), TÜV (DE) — פרמיום לכל מדינה",            "$500–2,000/חודש"],
            ["מענקי EU",           "קרנות אינטגרציית מהגרים של האיחוד האירופי",          "$10,000–50,000"],
            ["ביטוח רכב",          "Allianz, AXA, Generali — עמלות הפניה",              "$80–300/עסקה"],
            ["Western Union",      "שירותי העברת כסף לאתיופיה — פרסום ממוקד",            "$300–1,000/חודש"],
            ["SaaS בתי ספר",       "בתי ספר המלמדים מהגרים — דאשבורד B2B",              "$50–150/תלמיד"],
            ["חברות רכב",          "Toyota, Hyundai — מוכרות להמוני מהגרים חדשים",       "$500–2,000/חודש"],
        ],
        col_widths=[45*mm, 85*mm, 40*mm],
        header_color=C_GREEN, row_colors=[colors.white, C_LGGREEN],
        note_he="💡 בריטניה: DVSA Theory Test — שוק של 1.5M נבחנים/שנה. אין אפליקציה באמהרית!"
    )
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 4 — USA
    # ══════════════════════════════════════════════════════════════════════════
    country_section(story, S,
        flag="🇺🇸", title_he="ארה\"ב וקנדה",
        audience_he="~400,000 אתיופים — וושינגטון DC, מינסוטה, אטלנטה, סיאטל",
        rows=[
            ["ערוץ הכנסה",         "פירוט",                                              "הכנסה חזויה"],
            ["רישוי לפי State",    "DMV שונה לכל מדינה — גרסת פרמיום לכל State",         "$1,000–5,000/חודש"],
            ["ביטוח",              "Geico, Progressive, State Farm — עמלת הפניה",        "$100–400/עסקה"],
            ["Platform Licensing", "מכירת הטכנולוגיה לקהילות ספרדית, ערבית, סומלית",    "$1,000–5,000/חודש"],
            ["Uber/Lyft",          "פרסום לנהגים פוטנציאליים חדשים",                     "$500–2,000/חודש"],
            ["עמלת הפניה לביטוח",  "כל לקוח שעבר רישיון → מופנה לביטוח",               "$50–200/עסקה"],
            ["קהילה + עסקים",      "מדריך עסקים אתיופים — מסעדות, חנויות",              "$200–800/חודש"],
        ],
        col_widths=[45*mm, 85*mm, 40*mm],
        header_color=C_ORANGE, row_colors=[colors.white, C_LORANGE],
        note_he="💡 Platform Licensing: ספרדית (56M דוברים בארה\"ב) — פוטנציאל $50,000+/חודש"
    )

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 5 — ARAB COUNTRIES
    # ══════════════════════════════════════════════════════════════════════════
    country_section(story, S,
        flag="🇸🇦", title_he="מדינות ערב — פוטנציאל הגדול ביותר!",
        audience_he="~500,000 עובדים אתיופים — סעודיה, UAE, קטר, כווית",
        rows=[
            ["ערוץ הכנסה",         "פירוט",                                              "הכנסה חזויה"],
            ["תוכן מקומי",         "RTA (UAE), Moroor (SA) — שוק לא מכוסה כלל!",        "$2,000–8,000/חודש"],
            ["SaaS בתי ספר",       "בתי ספר בדובאי/ריאד המלמדים עובדים זרים",           "$100–300/תלמיד"],
            ["Western Union",      "כל עובד שולח כסף הביתה — שוק ענק",                  "$500–2,000/חודש"],
            ["Telecom",            "Etisalat, STC, Ooredoo — לקוחות עובדים זרים",       "$1,000–4,000/חודש"],
            ["ביטוח רכב",          "AXA Gulf, RSA — נהגים חדשים",                       "$80–250/עסקה"],
            ["Agency fees",        "עמלה מבית ספר על כל תלמיד שהאפליקציה הפנתה",        "$20–50/תלמיד"],
        ],
        col_widths=[45*mm, 85*mm, 40*mm],
        header_color=C_RED, row_colors=[colors.white, C_LRED],
        note_he="💡 זהו השוק הפחות מכוסה! אין שום אפליקציה תיאוריה באמהרית עבור נהיגה בדובאי/ריאד"
    )
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 6 — ETHIOPIA
    # ══════════════════════════════════════════════════════════════════════════
    country_section(story, S,
        flag="🇪🇹", title_he="אתיופיה — שוק עתידי",
        audience_he="מעמד ביניים גדל, ~5M בעלי רכב (2024)",
        rows=[
            ["ערוץ הכנסה",         "פירוט",                                              "הכנסה חזויה"],
            ["Freemium מקומי",     "תשלום דרך Telebirr (ארנק דיגיטלי מקומי)",           "$200–1,000/חודש"],
            ["בתי ספר לנהיגה",     "SaaS — אדיס-אבבה, בהר-דהר",                        "$30–80/תלמיד"],
            ["Ethiopian Airlines", "מממן אפליקציות לאתיופים בחו\"ל — ספונסרשיפ",        "$500–3,000/חודש"],
            ["NGO / ממשלה",        "משרד התחבורה — שיפור בטיחות בדרכים",                "$5,000–30,000"],
            ["M-Pesa",             "שותפות עם שירותי תשלום מקומיים",                    "$100–500/חודש"],
        ],
        col_widths=[45*mm, 85*mm, 40*mm],
        header_color=C_PURPLE, row_colors=[colors.white, C_LPURPLE],
        note_he="💡 NGO grants: USAID, World Bank ממנים פרויקטים לבטיחות בדרכים באפריקה"
    )

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 7 — PLATFORM LICENSING
    # ══════════════════════════════════════════════════════════════════════════
    story.append(HRFlowable(width=W, color=C_TEAL, thickness=2))
    story.append(Paragraph(r("✦  רעיון הגדול — Platform Licensing"), S["section_title"]))
    story.append(Paragraph(
        r("בנית מנוע לימוד תיאוריה עם קול, תמונות ובינה מלאכותית. "
          "אפשר למכור/להשכיר את הטכנולוגיה לקהילות אחרות בעולם:"),
        S["body"]))
    story.append(Spacer(1, 6))

    license_table = make_table(
        [
            ["קהל",          "שוק",    "גודל קהל",    "הכנסה חודשית אפשרית"],
            ["ספרדית",       "ארה\"ב", "56M",          "$5,000–20,000"],
            ["ערבית",        "אירופה", "25M",          "$3,000–12,000"],
            ["סומלית",       "ארה\"ב/EU", "2M",        "$500–2,000"],
            ["רוסית",        "ישראל",  "1.5M",         "$1,000–4,000"],
            ["אמהרית (EU)",  "שוודיה", "150K",         "$300–1,500"],
        ],
        [35*mm, 30*mm, 30*mm, 75*mm],
        header_color=C_TEAL, row_colors=[colors.white, C_LTEAL]
    )
    story.append(license_table)
    story.append(Spacer(1, 14))

    # ══════════════════════════════════════════════════════════════════════════
    # SECTION 8 — ROADMAP
    # ══════════════════════════════════════════════════════════════════════════
    story.append(HRFlowable(width=W, color=C_GOLD, thickness=2))
    story.append(Paragraph(r("✦  מפת דרכים — סדר עדיפויות"), S["section_title"]))

    roadmap = make_table(
        [
            ["שלב",   "זמן",             "פעולה",                               "הכנסה צפויה/חודש"],
            ["1",     "עכשיו",           "פרסום מורי נהיגה + Freemium (ישראל)", "$500–2,000"],
            ["2",     "3–6 חודשים",      "מיקום GPS + תשלום לפי ליד",           "$1,000–4,000"],
            ["3",     "6 חודשים",        "UAE/דובאי — תוכן נהיגה + פרסום",      "$2,000–8,000"],
            ["4",     "שנה",             "Platform Licensing — ספרדית/ערבית",   "$5,000–20,000"],
            ["5",     "שנה וחצי",        "עמלות ביטוח אוטומטיות",              "$3,000–15,000"],
            ["6",     "שנתיים",          "SaaS לבתי ספר לנהיגה גלובלי",        "$10,000–50,000"],
        ],
        [12*mm, 30*mm, 80*mm, 48*mm],
        header_color=C_GOLD, row_colors=[colors.white, C_LGOLD]
    )
    story.append(roadmap)
    story.append(Spacer(1, 20))

    # ══════════════════════════════════════════════════════════════════════════
    # FOOTER
    # ══════════════════════════════════════════════════════════════════════════
    story.append(HRFlowable(width=W, color=C_LGRAY, thickness=1))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        r("מסמך זה נוצר עבור אפליקציית תיאוריית הנהיגה האתיופית | סודי ואינו מיועד להפצה"),
        S["footer"]))

    doc.build(story)
    print(f"✅ PDF נוצר בהצלחה: {output}")

if __name__ == "__main__":
    build_pdf()

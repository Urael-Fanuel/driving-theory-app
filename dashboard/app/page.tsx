import { supabaseGet, supabaseCount } from "@/lib/supabase";
import { LineChart, type Series } from "@/components/LineChart";

export const dynamic = "force-dynamic"; // דשבורד תפעולי — לעולם לא לשמור בקאש סטטי

interface MetricRow {
  policy_version: string;
  sample_size: number;
  log_loss: number;
  accuracy: number;
  auc: number;
  is_simulated: boolean;
  evaluated_at: string;
}

const ELO_COLOR = "#2563eb";
const BASELINE_COLOR = "#e67e22";

function seriesFor(
  metrics: MetricRow[],
  policyVersion: string,
  field: "log_loss" | "accuracy",
  color: string,
  label: string,
  dashed = false
): Series {
  return {
    label,
    color,
    dashed,
    points: metrics
      .filter((m) => m.policy_version === policyVersion)
      .map((m) => ({ x: m.sample_size, y: m[field] })),
  };
}

export default async function DashboardPage() {
  let metrics: MetricRow[] = [];
  let realCounts: {
    users: number;
    examSessions: number;
    answers: number;
    signQuestions: number;
    behavioralQuestions: number;
    signs: number;
  } | null = null;
  let error: string | null = null;

  try {
    const [metricsResult, users, examSessions, answers, signQuestions, behavioralQuestions, signs] =
      await Promise.all([
        supabaseGet<MetricRow[]>(
          "agent_metrics",
          "?select=policy_version,sample_size,log_loss,accuracy,auc,is_simulated,evaluated_at&order=sample_size.asc"
        ),
        supabaseCount("users"),
        supabaseCount("exam_sessions"),
        supabaseCount("user_progress"),
        // "questions" holds both real sign questions (sign_id set) and the
        // behavioral registry rows (sign_id NULL — see
        // scripts/registerBehavioralQuestions.ts). Split so the count is
        // never silently misleading about what it actually measures.
        supabaseCount("questions", "&sign_id=not.is.null"),
        supabaseCount("questions", "&sign_id=is.null"),
        supabaseCount("signs"),
      ]);
    metrics = metricsResult;
    realCounts = { users, examSessions, answers, signQuestions, behavioralQuestions, signs };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const hasSimulated = metrics.some((m) => m.is_simulated);
  const latestElo = [...metrics]
    .filter((m) => m.policy_version === "elo-v1-simulated")
    .sort((a, b) => b.sample_size - a.sample_size)[0];
  const latestBaseline = [...metrics]
    .filter((m) => m.policy_version === "random-baseline")
    .sort((a, b) => b.sample_size - a.sample_size)[0];

  return (
    <main>
      <h1>הסוכן הלומד — דשבורד</h1>
      <p className="subtitle">
        אפליקציית תיאוריית נהיגה לאתיופים · בחירת שאלות אדפטיבית בשיטת ELO
      </p>

      {error && (
        <div className="error-box">
          טעינת הנתונים מ-Supabase נכשלה: {error}
        </div>
      )}

      {!error && (
        <>
          <section className="card">
            <h2>
              האם הסוכן משתפר?{" "}
              <span className="badge badge-simulated">נתוני סימולציה</span>
            </h2>

            {!hasSimulated ? (
              <p className="note">
                אין עדיין שורות ב-agent_metrics. הרץ{" "}
                <code>npx tsx scripts/simulateAgentLearning.ts</code>.
              </p>
            ) : (
              <>
                <div className="grid" style={{ marginBottom: 8 }}>
                  <div className="stat">
                    <div className="stat-value">
                      {latestElo ? `${(latestElo.accuracy * 100).toFixed(1)}%` : "—"}
                    </div>
                    <div className="stat-label">
                      דיוק חיזוי אחרי {latestElo?.sample_size.toLocaleString()} תשובות
                    </div>
                  </div>
                  <div className="stat">
                    <div className="stat-value">
                      {latestBaseline ? `${(latestBaseline.accuracy * 100).toFixed(1)}%` : "—"}
                    </div>
                    <div className="stat-label">דיוק בסיס אקראי (קבוע, בלי למידה)</div>
                  </div>
                  <div className="stat">
                    <div className="stat-value">
                      {latestElo ? latestElo.auc.toFixed(3) : "—"}
                    </div>
                    <div className="stat-label">AUC (0.5 = ניחוש, 1.0 = מושלם)</div>
                  </div>
                </div>

                {/* הגרפים עצמם נשארים LTR בכוונה — ציר זמן/כמות שגדל משמאל לימין
                    הוא מוסכמה כמעט אוניברסלית לגרפים, גם בתוך ממשק בעברית. */}
                <div className="charts-row" dir="ltr">
                  <div>
                    <LineChart
                      series={[
                        seriesFor(metrics, "elo-v1-simulated", "log_loss", ELO_COLOR, "סוכן ELO"),
                        seriesFor(metrics, "random-baseline", "log_loss", BASELINE_COLOR, "בסיס אקראי", true),
                      ]}
                      xLabel="תשובות מדומות שנצפו"
                      yLabel="Log-loss (נמוך יותר = טוב יותר)"
                      formatX={(x) => (x >= 1000 ? `${x / 1000}k` : String(x))}
                    />
                  </div>
                  <div>
                    <LineChart
                      series={[
                        seriesFor(metrics, "elo-v1-simulated", "accuracy", ELO_COLOR, "סוכן ELO"),
                        seriesFor(metrics, "random-baseline", "accuracy", BASELINE_COLOR, "בסיס אקראי", true),
                      ]}
                      xLabel="תשובות מדומות שנצפו"
                      yLabel="דיוק חיזוי"
                      formatX={(x) => (x >= 1000 ? `${x / 1000}k` : String(x))}
                      formatY={(y) => `${(y * 100).toFixed(0)}%`}
                    />
                  </div>
                </div>

                <div className="legend">
                  <span className="legend-item">
                    <span className="legend-swatch" style={{ background: ELO_COLOR }} />
                    סוכן ELO (elo-v1-simulated)
                  </span>
                  <span className="legend-item">
                    <span className="legend-swatch" style={{ background: BASELINE_COLOR, opacity: 0.8 }} />
                    בסיס אקראי, בלי למידה
                  </span>
                </div>

                <p className="note">
                  הערכה על קבוצת מבחן קפואה (held-out) של זוגות (משתמש, שאלה) מדומים —
                  לעולם לא משמשת לאימון, נבדקת מחדש בכל נקודת ביקורת ככל שהמודל רואה יותר
                  תשובות מדומות. אותו קוד ELO
                  (<code>supabase/functions/_shared/elo.ts</code>) שמשמש כאן רץ גם ב-Edge
                  Functions בייצור: <code>agent-select-questions</code> ו-
                  <code>agent-record-answer</code>. נוצר על ידי{" "}
                  <code>scripts/simulateAgentLearning.ts</code> עם זרע אקראי קבוע — זו הוכחה
                  מבוקרת שהאלגוריתם לומד, שנוצרה כי לאפליקציה עדיין אין מספיק תשובות אמיתיות
                  כדי שהעקומה הזו תהיה משמעותית מנתוני ייצור בלבד.
                </p>
              </>
            )}
          </section>

          <section className="card">
            <h2>
              שימוש באפליקציה <span className="badge badge-real">נתונים חיים</span>
            </h2>
            {realCounts && (
              <div className="grid">
                <div className="stat">
                  <div className="stat-value">{realCounts.users.toLocaleString()}</div>
                  <div className="stat-label">שורות משתמשים (ראה הערה למטה)</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{realCounts.answers.toLocaleString()}</div>
                  <div className="stat-label">תשובות שנרשמו</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{realCounts.examSessions.toLocaleString()}</div>
                  <div className="stat-label">מבחנים שהושלמו</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{realCounts.signQuestions.toLocaleString()}</div>
                  <div className="stat-label">שאלות תמרורים במאגר</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{realCounts.behavioralQuestions.toLocaleString()}</div>
                  <div className="stat-label">שאלות התנהגותיות במאגר</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{realCounts.signs.toLocaleString()}</div>
                  <div className="stat-label">תמרורים במאגר</div>
                </div>
              </div>
            )}
            <p className="note">
              &quot;שורות משתמשים&quot; סופר כל שורה בטבלת <code>users</code>, וזה עדיין לא
              זהה למספר האנשים האמיתיים: לפני התיקון לשמירת הסשן (AsyncStorage), הפעלה
              שנכשלה בשחזור הסשן יצרה שורה חדשה בכל פתיחה של האפליקציה. יש להתייחס למספר הזה
              כאל חסם עליון, עד שיעבור מספיק זמן מאז שהתיקון הגיע ל-build שהנסיינים באמת
              מתקינים.
              <br />
              &quot;שאלות התנהגותיות במאגר&quot; הן רשומות זיהוי בלבד
              (<code>scripts/registerBehavioralQuestions.ts</code>) — התוכן עצמו עדיין
              מוצג מקובצי JSON מקומיים כדי שיעבוד ללא אינטרנט. הרישום קיים כדי שתשובות
              לשאלות אלה יוכלו להישמר ושהסוכן הלומד יוכל לעקוב אחריהן, אחרי שגילינו
              שכל תשובה כזו נכשלה בשמירה עד עכשיו.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

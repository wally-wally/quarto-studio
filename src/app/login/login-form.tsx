"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction, registerAction } from "@/lib/auth/actions";

type FieldErrors = {
  email?: string;
  password?: string;
  password2?: string;
};

// design/signup.html 의 비밀번호 강도 로직 이식
const STRENGTH_LEVELS = [
  { pct: "20%", color: "#ef4444", text: "매우 약함" },
  { pct: "40%", color: "#f97316", text: "약함" },
  { pct: "60%", color: "#eab308", text: "보통" },
  { pct: "80%", color: "#22c55e", text: "강함" },
  { pct: "100%", color: "#16a34a", text: "매우 강함" }
];

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return STRENGTH_LEVELS[Math.min(Math.max(score - 1, 0), 4)];
}

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!email || !email.includes("@")) {
      next.email = "올바른 이메일 주소를 입력해주세요.";
    }
    if (isRegister) {
      if (password.length < 8) {
        next.password = "비밀번호는 8자 이상이어야 합니다.";
      }
      if (password !== password2) {
        next.password2 = "비밀번호가 일치하지 않습니다.";
      }
    } else if (!password) {
      next.password = "비밀번호를 입력해주세요.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) {
      return;
    }
    setLoading(true);

    try {
      const result = isRegister
        ? await registerAction({ email, password, name: name || undefined })
        : await loginAction({ email, password });

      if (result.ok) {
        router.push("/");
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
    setFieldErrors({});
    setName("");
    setEmail("");
    setPassword("");
    setPassword2("");
    setAgreed(false);
  }

  const strength = isRegister && password ? passwordStrength(password) : null;

  return (
    <div className="auth-shell">
      {/* ── 왼쪽 브랜드 패널 ── */}
      <aside className={`auth-brand ${isRegister ? "auth-brand--signup" : "auth-brand--login"}`}>
        <div className="auth-brand-logo">
          <span className="auth-brand-mark">Q</span>
          <span className="auth-brand-name">Quarto Studio</span>
        </div>

        <div className="auth-brand-body">
          {isRegister ? (
            <>
              <h1 className="auth-headline">
                지금 시작하면
                <br />
                <em>무료</em>로
                <br />
                모두 사용할 수 있어요
              </h1>
              <p className="auth-desc">
                회원가입 즉시 Quarto Studio의 모든 기능을 무료로 사용하세요. 신용카드 불필요.
              </p>
              <div className="auth-plan">
                <span className="auth-plan-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  FREE 플랜
                </span>
                <div className="auth-plan-title">지금 바로 시작</div>
                <div className="auth-plan-items">
                  {["QMD 문서 무제한 생성", "코드 실행 및 실시간 렌더링", "HTML 문서 내보내기"].map((item) => (
                    <div className="auth-plan-item" key={item}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 className="auth-headline">
                문서 작성과
                <br />
                <em>렌더링</em>을
                <br />
                하나의 공간에서
              </h1>
              <p className="auth-desc">
                Quarto 기반의 마크다운 에디터로 코드와 텍스트를 함께 작성하고, 실시간으로 HTML 문서를 렌더링하세요.
              </p>
              <div className="auth-features">
                {[
                  "QMD 문서 작성 및 실시간 미리보기",
                  "Julia, Python, R 코드 실행 지원",
                  "HTML 문서 다운로드 및 공유"
                ].map((feature) => (
                  <div className="auth-feature" key={feature}>
                    <span className="auth-feature-dot" />
                    {feature}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="auth-brand-footer">© 2026 Quarto Studio</div>
      </aside>

      {/* ── 오른쪽 폼 패널 ── */}
      <main className="auth-form-panel">
        <div className="auth-form-card">
          <div className="auth-form-header">
            <h1 className="auth-form-title">{isRegister ? "계정 만들기" : "다시 오셨군요 👋"}</h1>
            <p className="auth-form-subtitle">
              {isRegister
                ? "Quarto Studio와 함께 문서 작업을 시작하세요."
                : "계정에 로그인하여 문서 작업을 이어가세요."}
            </p>
          </div>

          {error && (
            <p className="auth-alert" role="alert">
              {error}
            </p>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {isRegister && (
              <div className="auth-group">
                <label htmlFor="name">
                  이름 <span className="auth-label-opt">(선택)</span>
                </label>
                <input
                  id="name"
                  className="auth-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  disabled={loading}
                />
              </div>
            )}

            <div className={`auth-group ${fieldErrors.email ? "has-error" : ""}`}>
              <label htmlFor="email">이메일</label>
              <input
                id="email"
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={loading}
              />
              {fieldErrors.email && <div className="auth-field-error">{fieldErrors.email}</div>}
            </div>

            <div className={`auth-group ${fieldErrors.password ? "has-error" : ""}`}>
              <label htmlFor="password">비밀번호</label>
              <input
                id="password"
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? "8자 이상" : "비밀번호 입력"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                disabled={loading}
              />
              {strength && (
                <div className="auth-pw-strength">
                  <div className="auth-pw-track">
                    <div
                      className="auth-pw-fill"
                      style={{ width: strength.pct, background: strength.color }}
                    />
                  </div>
                  <div className="auth-pw-label" style={{ color: strength.color }}>
                    {strength.text}
                  </div>
                </div>
              )}
              {fieldErrors.password && <div className="auth-field-error">{fieldErrors.password}</div>}
            </div>

            {isRegister && (
              <div className={`auth-group ${fieldErrors.password2 ? "has-error" : ""}`}>
                <label htmlFor="password2">비밀번호 확인</label>
                <input
                  id="password2"
                  className="auth-input"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  placeholder="비밀번호 재입력"
                  autoComplete="new-password"
                  disabled={loading}
                />
                {fieldErrors.password2 && (
                  <div className="auth-field-error">{fieldErrors.password2}</div>
                )}
              </div>
            )}

            {isRegister && (
              <div className="auth-terms">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  disabled={loading}
                />
                <label htmlFor="terms">
                  <a href="#" className="auth-terms-link">
                    이용약관
                  </a>{" "}
                  및{" "}
                  <a href="#" className="auth-terms-link">
                    개인정보처리방침
                  </a>
                  에 동의합니다.
                </label>
              </div>
            )}

            <button
              type="submit"
              className={`auth-submit ${loading ? "loading" : ""}`}
              disabled={loading || (isRegister && !agreed)}
            >
              {loading ? "처리 중..." : isRegister ? "회원가입" : "로그인"}
            </button>
          </form>

          {!isRegister && (
            <div className="auth-divider">
              <span className="auth-divider-line" />
              <span className="auth-divider-text">또는</span>
              <span className="auth-divider-line" />
            </div>
          )}

          <p className="auth-footer">
            {isRegister ? "이미 계정이 있으신가요?" : "계정이 없으신가요?"}{" "}
            <button type="button" className="auth-link" onClick={switchMode}>
              {isRegister ? "로그인" : "회원가입"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAction, registerAction } from "@/lib/auth/actions";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let result;
      if (mode === "register") {
        result = await registerAction({ email, password, name: name || undefined });
      } else {
        result = await loginAction({ email, password });
      }

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
    setName("");
    setEmail("");
    setPassword("");
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #bdd1e8",
    borderRadius: 6,
    outline: "none",
    background: "#ffffff",
    color: "#142033",
    height: 36,
    padding: "0 10px",
    fontSize: 14,
    fontWeight: 400,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#eef3f8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#ffffff",
          border: "1px solid #bdd1e8",
          borderRadius: 12,
          padding: "36px 32px",
          boxShadow: "0 8px 24px rgba(11, 31, 58, 0.08)",
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
          }}
        >
          <div
            className="brand-mark"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              display: "grid",
              placeItems: "center",
              background: "#38bdf8",
              color: "#09223d",
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            Q
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#0b1f3a" }}>
            Quarto Studio
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            margin: "0 0 24px",
            fontSize: 20,
            fontWeight: 800,
            color: "#0b1f3a",
          }}
        >
          {mode === "login" ? "로그인" : "회원가입"}
        </h1>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          {/* Name field (register only) */}
          {mode === "register" && (
            <div style={{ display: "grid", gap: 6 }}>
              <label
                htmlFor="name"
                style={{ fontSize: 12, fontWeight: 760, color: "#315170" }}
              >
                이름 (선택)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                style={inputStyle}
                disabled={loading}
              />
            </div>
          )}

          {/* Email field */}
          <div style={{ display: "grid", gap: 6 }}>
            <label
              htmlFor="email"
              style={{ fontSize: 12, fontWeight: 760, color: "#315170" }}
            >
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={inputStyle}
              disabled={loading}
            />
          </div>

          {/* Password field */}
          <div style={{ display: "grid", gap: 6 }}>
            <label
              htmlFor="password"
              style={{ fontSize: 12, fontWeight: 760, color: "#315170" }}
            >
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "8자 이상" : "비밀번호"}
              required
              style={inputStyle}
              disabled={loading}
            />
          </div>

          {/* Error message */}
          {error && (
            <p
              style={{
                margin: 0,
                padding: "8px 12px",
                background: "#fff1f2",
                border: "1px solid #fecaca",
                borderRadius: 6,
                color: "#9f1239",
                fontSize: 13,
              }}
            >
              {error}
            </p>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="primary-button"
            style={{
              width: "100%",
              height: 40,
              fontSize: 14,
              fontWeight: 760,
              marginTop: 4,
              justifyContent: "center",
            }}
          >
            {loading
              ? "처리 중..."
              : mode === "login"
                ? "로그인"
                : "회원가입"}
          </button>
        </form>

        {/* Mode toggle */}
        <p
          style={{
            margin: "20px 0 0",
            fontSize: 13,
            color: "#64748b",
            textAlign: "center",
          }}
        >
          {mode === "login" ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            style={{
              border: 0,
              background: "transparent",
              color: "#38bdf8",
              cursor: "pointer",
              fontWeight: 760,
              fontSize: 13,
              padding: 0,
            }}
          >
            {mode === "login" ? "회원가입" : "로그인"}
          </button>
        </p>
      </div>
    </div>
  );
}

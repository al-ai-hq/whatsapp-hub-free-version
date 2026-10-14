"use client";

export default function LogoutButton() {
  async function logout(all: boolean) {
    await fetch(all ? "/api/auth/logout-all" : "/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <span className="row" style={{ gap: 8 }}>
      <button data-test-id="logout" className="btn btn--ghost btn--sm" onClick={() => logout(false)}>
        Sign out
      </button>
      <button data-test-id="logout-all" className="btn btn--ghost btn--sm" style={{ color: "var(--danger)" }} onClick={() => logout(true)}>
        Everywhere
      </button>
    </span>
  );
}

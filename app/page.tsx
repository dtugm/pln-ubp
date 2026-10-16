 "use client";

import { useEffect, useState } from "react";
import MapView from "@/components/MapView";

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [checkingLogin, setCheckingLogin] = useState(true);

  useEffect(() => {
    const savedLogin =
      sessionStorage.getItem("pln-map-login") === "true";

    if (savedLogin) {
      setLoggedIn(true);
    }
    setCheckingLogin(false);
  }, []);

  function handleLogin(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (username === "pln" && password === "pln2026!") {
    // Simpan status login agar tetap masuk saat refresh.
    sessionStorage.setItem("pln-map-login", "true");
    setLoggedIn(true);
  } else {
    alert("Username atau password salah!");
  }
}

  if (!loggedIn) {
    return (
      <main className="login-screen">
        <div className="login-orbit orbit-one" />
        <div className="login-orbit orbit-two" />
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-logo-login">
            <img
              src="/assets/logo-pln.webp"
              alt="Logo PLN"
              className="pln-login-logo"
            />
          </div>
          <p className="eyebrow">SISTEM INFORMASI GEOGRAFIS</p>
          <h1>WebGIS TambakLorok</h1>
          <p className="login-subtitle">Unit Pelaksana Proyek</p>
          <label className="form-field">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Masukkan username" autoComplete="username" required />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Masukkan password" autoComplete="current-password" required />
          </label>
          <div className="login-options">
            <label className="remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Ingat saya</label>
            <button type="button" className="text-button" onClick={() => alert("Fitur pemulihan password perlu dihubungkan ke sistem autentikasi.")}>Lupa password?</button>
          </div>
          <button className="primary-button" type="submit">Masuk <span>→</span></button>
          <p className="prototype-note">Prototype awal · login belum terhubung ke server</p>
        </form>
        <div className="login-footer">PLN WebGIS TambakLorok <span>•</span> Unit Pelaksana Proyek</div>
      </main>
    );
  }

  return <MapView username={username || "Pengguna"} onLogout={() => setLoggedIn(false)} />;
}

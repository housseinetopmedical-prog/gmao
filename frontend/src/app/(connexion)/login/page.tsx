"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";
import MedicalDeviceLogoIcon from "@/composants/commun/LogoDispositifMedical";

type ForgotStep = 1 | 2 | 3;

const LOGIN_IDENTIFIER_STORAGE_KEY = "remembered_login_identifier";
const REMEMBER_ME_STORAGE_KEY = "remembered_login_enabled";
const SESSION_COOKIE_NAME = "session_active";

async function readJsonSafely(response: Response) {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>(1);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotInfo, setForgotInfo] = useState("");
  const [forgotData, setForgotData] = useState({
    email: "",
    code: "",
    newPassword: "",
    confirmPassword: ""
  });

  useEffect(() => {
    const rememberedEmail = localStorage.getItem(LOGIN_IDENTIFIER_STORAGE_KEY) || "";
    const rememberedEnabled = localStorage.getItem(REMEMBER_ME_STORAGE_KEY) === "true";

    if (rememberedEmail) {
      setFormData((prev) => ({ ...prev, email: rememberedEmail }));
    }

    setRememberMe(rememberedEnabled);
  }, []);

  const openForgotPanel = () => {
    setForgotOpen(true);
    setForgotStep(1);
    setForgotError("");
    setForgotInfo("");
    setForgotData({
      email: formData.email.trim(),
      code: "",
      newPassword: "",
      confirmPassword: ""
    });
  };

  const closeForgotPanel = () => {
    setForgotOpen(false);
    setForgotStep(1);
    setForgotError("");
    setForgotInfo("");
    setForgotLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password
        }),
      });

      const data = await readJsonSafely(res);

      if (res.ok) {
        localStorage.setItem("user", JSON.stringify(data));
        document.cookie = rememberMe
          ? `${SESSION_COOKIE_NAME}=true; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
          : `${SESSION_COOKIE_NAME}=true; path=/; SameSite=Lax`;

        if (rememberMe) {
          localStorage.setItem(LOGIN_IDENTIFIER_STORAGE_KEY, formData.email.trim());
          localStorage.setItem(REMEMBER_ME_STORAGE_KEY, "true");
        } else {
          localStorage.removeItem(LOGIN_IDENTIFIER_STORAGE_KEY);
          localStorage.setItem(REMEMBER_ME_STORAGE_KEY, "false");
        }

        if (data.role === "ADMIN") {
          router.push("/admin/tableau-de-bord");
        } else if (data.role === "ADV") {
          router.push("/adv/tableau-de-bord");
        } else if (data.role === "TECHNICIAN") {
          router.push("/technicien/tableau-de-bord");
        } else if (data.role === "RESPONSABLE_TECHNIQUE") {
          router.push("/responsable-technique/tableau-de-bord");
        } else if (data.role === "RESPONSABLE_FACTURATION") {
          router.push("/facturation/Tableau-de-bord");
        } else if (data.role === "IMPORT") {
          router.push("/import");
        } else if (data.role === "RESPONSABLE_APPELS_OFFRE") {
          router.push("/appels-offre");
        } else if (data.role === "MAGASINIER") {
          router.push("/magasinier/tableau-de-bord");
        } else if (data.role === "CLIENT") {
          router.push("/client");
        } else {
          router.push("/");
        }
        router.refresh();
      } else {
        setError(data.error || "Identifiant ou mot de passe incorrect");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Une erreur est survenue lors de la connexion");
    } finally {
      setIsLoading(false);
    }
  };

  const sendForgotCode = async () => {
    setForgotError("");
    setForgotInfo("");
    if (!forgotData.email.trim()) {
      setForgotError("Merci de saisir votre e-mail.");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotData.email.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.error || "Impossible d'envoyer le code.");
        return;
      }

      const message = data.message || "Code envoyé par e-mail.";
      setForgotInfo(message);
      setForgotStep(2);
    } catch {
      setForgotError("Erreur réseau pendant l'envoi du code.");
    } finally {
      setForgotLoading(false);
    }
  };

  const verifyForgotCode = async () => {
    setForgotError("");
    setForgotInfo("");
    if (!forgotData.code.trim()) {
      setForgotError("Merci de saisir le code.");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotData.email.trim(),
          code: forgotData.code.trim()
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setForgotError(data.error || "Code invalide.");
        return;
      }

      setForgotInfo(data.message || "Code valide.");
      setForgotStep(3);
    } catch {
      setForgotError("Erreur réseau pendant la vérification.");
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgotPassword = async () => {
    setForgotError("");
    setForgotInfo("");

    if (forgotData.newPassword.trim().length < 6) {
      setForgotError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (forgotData.newPassword !== forgotData.confirmPassword) {
      setForgotError("La confirmation ne correspond pas au mot de passe.");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotData.email.trim(),
          code: forgotData.code.trim(),
          newPassword: forgotData.newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.error || "Impossible de réinitialiser le mot de passe.");
        return;
      }

      setFormData((prev) => ({ ...prev, email: forgotData.email.trim(), password: "" }));
      closeForgotPanel();
      setSuccess("Mot de passe réinitialisé. Vous pouvez vous connecter.");
    } catch {
      setForgotError("Erreur réseau pendant la réinitialisation.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-root">
      <div className="login-box card">
        <div className="login-header">
          <div className="logo-container">
            <MedicalDeviceLogoIcon size={72} />
          </div>
          <h1>Bienvenue sur la plateforme SAV de Top Medical</h1>
        </div>

        {error && (
          <div className="alert error-alert">
            {error}
          </div>
        )}
        {success && (
          <div className="alert success-alert">
            {success}
          </div>
        )}

        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label>Identifiant</label>
            <div className="input-wrapper">
              <User size={18} />
              <input
                type="text"
                placeholder="Saisir votre identifiant"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Mot de passe</label>
            <div className="input-wrapper">
              <Lock size={18} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="******"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="form-options">
            <label className="checkbox-label">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>Se souvenir de moi</span>
            </label>
            <button type="button" className="forgot-link" onClick={openForgotPanel}>
              Mot de passe oublié ?
            </button>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={isLoading}
          >
            {isLoading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        {forgotOpen && (
          <section className="forgot-panel" aria-live="polite">
            <div className="forgot-header">
              <h3>Mot de passe oublié</h3>
              <button type="button" className="forgot-close" onClick={closeForgotPanel}>
                Fermer
              </button>
            </div>

            <p className="forgot-subtitle">
              Étape {forgotStep}/3 - code de vérification par e-mail (Gmail).
            </p>

            {forgotError && <div className="alert error-alert">{forgotError}</div>}
            {forgotInfo && <div className="alert info-alert">{forgotInfo}</div>}

            {forgotStep === 1 && (
              <div className="forgot-grid">
                <label className="form-group">
                  <span>E-mail du compte</span>
                  <div className="input-wrapper">
                    <Mail size={18} />
                    <input
                      type="email"
                      placeholder="nom@hopital.com"
                      value={forgotData.email}
                      onChange={(e) => setForgotData((prev) => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                </label>
                <button type="button" className="btn btn-primary" onClick={sendForgotCode} disabled={forgotLoading}>
                  {forgotLoading ? "Envoi..." : "Envoyer le code"}
                </button>
              </div>
            )}

            {forgotStep === 2 && (
              <div className="forgot-grid">
                <label className="form-group">
                  <span>Code reçu par e-mail</span>
                  <div className="input-wrapper">
                    <KeyRound size={18} />
                    <input
                      type="text"
                      placeholder="Ex: 123456"
                      value={forgotData.code}
                      onChange={(e) => setForgotData((prev) => ({ ...prev, code: e.target.value }))}
                    />
                  </div>
                </label>
                <div className="forgot-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setForgotStep(1)} disabled={forgotLoading}>
                    Retour
                  </button>
                  <button type="button" className="btn btn-primary" onClick={verifyForgotCode} disabled={forgotLoading}>
                    {forgotLoading ? "Vérification..." : "Vérifier le code"}
                  </button>
                </div>
              </div>
            )}

            {forgotStep === 3 && (
              <div className="forgot-grid">
                <label className="form-group">
                  <span>Nouveau mot de passe</span>
                  <div className="input-wrapper">
                    <Lock size={18} />
                    <input
                      type="password"
                      placeholder="Au moins 6 caractères"
                      value={forgotData.newPassword}
                      onChange={(e) => setForgotData((prev) => ({ ...prev, newPassword: e.target.value }))}
                    />
                  </div>
                </label>
                <label className="form-group">
                  <span>Confirmer le mot de passe</span>
                  <div className="input-wrapper">
                    <Lock size={18} />
                    <input
                      type="password"
                      placeholder="Retapez le mot de passe"
                      value={forgotData.confirmPassword}
                      onChange={(e) => setForgotData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    />
                  </div>
                </label>
                <div className="forgot-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setForgotStep(2)} disabled={forgotLoading}>
                    Retour
                  </button>
                  <button type="button" className="btn btn-primary" onClick={resetForgotPassword} disabled={forgotLoading}>
                    {forgotLoading ? "Réinitialisation..." : "Réinitialiser"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="login-footer">
          <p>© 2026 Top Médical SAV</p>
        </div>
      </div>

      <style jsx>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%);
          padding: 1rem;
        }

        .login-box {
          width: 100%;
          max-width: 460px;
          padding: 2.2rem;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
          border: none;
        }

        .login-form {
          display: grid;
          gap: 0.2rem;
          width: 100%;
        }

        .login-header {
          text-align: center;
          margin-bottom: 1.7rem;
        }

        .logo-container {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.2rem;
        }

        .login-header h1 {
          font-size: 1.15rem;
          margin-bottom: 0.5rem;
        }

        .login-header p {
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .alert {
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.875rem;
          margin-bottom: 1rem;
          text-align: center;
          border: 1px solid transparent;
        }

        .error-alert {
          background: #fef2f2;
          color: #dc2626;
          border-color: #fee2e2;
        }

        .success-alert {
          background: #ecfdf3;
          color: #059669;
          border-color: #bbf7d0;
        }

        .info-alert {
          background: #fff1f2;
          color: #991b1b;
          border-color: #fecdd3;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label,
        .form-group span {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          margin-bottom: 0.45rem;
          color: var(--text-primary);
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .input-wrapper :global(svg) {
          position: absolute;
          left: 12px;
          color: var(--text-secondary);
        }

        .input-wrapper input {
          width: 100%;
          padding: 0.75rem 1rem 0.75rem 2.5rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s;
          background: var(--bg-card);
          color: var(--text-primary);
        }

        .input-wrapper input:focus {
          border-color: var(--primary-blue);
        }

        .input-wrapper input::-ms-reveal,
        .input-wrapper input::-ms-clear {
          display: none;
        }

        .eye-btn {
          position: absolute;
          right: 12px;
          border: none;
          padding: 0;
          background: none;
          color: var(--text-secondary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .form-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          font-size: 0.875rem;
          margin-bottom: 1.2rem;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          flex-wrap: wrap;
        }

        .forgot-link {
          border: none;
          background: transparent;
          color: var(--primary-blue);
          font-weight: 600;
          cursor: pointer;
          margin-left: auto;
          text-align: right;
        }

        .login-submit {
          width: 100%;
          margin-top: 0.5rem;
        }

        .forgot-panel {
          margin-top: 1.2rem;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1rem;
          background: var(--bg-card);
        }

        .forgot-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.4rem;
        }

        .forgot-header h3 {
          font-size: 1rem;
          margin: 0;
        }

        .forgot-close {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 0.35rem 0.7rem;
          background: var(--bg-main);
          color: var(--text-secondary);
          font-size: 0.8rem;
          cursor: pointer;
        }

        .forgot-subtitle {
          margin-bottom: 0.8rem;
          color: var(--text-secondary);
          font-size: 0.85rem;
        }

        .forgot-grid {
          display: grid;
          gap: 0.75rem;
        }

        .forgot-actions {
          display: grid;
          gap: 0.65rem;
          grid-template-columns: 1fr 1fr;
        }

        .login-footer {
          margin-top: 1.5rem;
          text-align: center;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        @media (max-width: 640px) {
          .login-box {
            padding: 1.35rem;
          }

          .form-options {
            align-items: flex-start;
          }

          .forgot-link {
            margin-left: 0;
            width: 100%;
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
}

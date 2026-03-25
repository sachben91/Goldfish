// Login screen — technicians enter their phone number and receive an OTP via SMS.
// No password to remember. Session is stored in browser cookies for 7 days.

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function signInAsDemo() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInAnonymously();
    setLoading(false);
    if (error) setError(error.message);
    else window.location.href = "/schedule";
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      phone: phone.trim(),
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setStep("otp");
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: otp.trim(),
      type: "sms",
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      // Auth state change will redirect via middleware
      window.location.href = "/";
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-4xl mb-3">🐠</div>
          <h1 className="text-2xl font-bold text-slate-900">Goldfish Express</h1>
          <p className="text-slate-500 mt-1 text-sm">Technician Portal</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={requestOtp} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="+1 555 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg text-base font-medium disabled:opacity-50"
            >
              {loading ? "Sending code…" : "Send code"}
            </button>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs text-slate-400">or</span>
              </div>
            </div>
            <button
              type="button"
              onClick={signInAsDemo}
              disabled={loading}
              className="w-full bg-slate-100 text-slate-700 py-3 rounded-lg text-base font-medium disabled:opacity-50"
            >
              Continue as demo
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <p className="text-slate-600 text-sm text-center">
              Enter the code sent to <span className="font-medium">{phone}</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-4 text-3xl text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={6}
              required
            />
            {error && <p className="text-red-600 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg text-base font-medium disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="w-full text-slate-500 text-sm py-2"
            >
              Use a different number
            </button>
          </form>
        )}

      </div>
    </div>
  );
}

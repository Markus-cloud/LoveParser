import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { Phone, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

export default function Login() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const formatPhoneNumber = (value: string) => {
    // Удаляем все нецифровые символы
    const digits = value.replace(/\D/g, "");
    
    // Форматируем номер телефона
    if (digits.length === 0) return "";
    if (digits.length <= 1) return `+${digits}`;
    if (digits.length <= 4) return `+${digits}`;
    if (digits.length <= 7) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 9) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, "");
    if (!phoneNumber || cleanPhoneNumber.length < 10) {
      toast.error("Введите корректный номер телефона");
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/telegram/auth/send-code', {
        method: 'POST',
        body: { phoneNumber: cleanPhoneNumber },
      });

      toast.success("Код подтверждения отправлен в Telegram");
      setStep("code");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Ошибка отправки кода";
      toast.error(errorMessage);
      console.error("Send code error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code || code.length < 5) {
      toast.error("Введите код подтверждения");
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch('/telegram/auth/sign-in', {
        method: 'POST',
        body: { 
          phoneCode: code,
          password: needsPassword ? password : undefined,
        },
      }) as { success?: boolean; user?: { id: string | number; username?: string; firstName?: string; lastName?: string }; session?: string };

      if (data.success && data.user) {
        const userData = {
          id: String(data.user.id),
          username: data.user.username,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          first_name: data.user.firstName,
          last_name: data.user.lastName,
        };
        
        await login(userData, data.session);
        toast.success("Авторизация успешна!");
        navigate("/");
      } else {
        throw new Error("Не удалось получить данные пользователя");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Ошибка авторизации";
      
      if (errorMessage.includes('Password required') || errorMessage.includes('password') || errorMessage.includes('2FA') || errorMessage.includes('PASSWORD')) {
        if (!needsPassword) {
          setNeedsPassword(true);
          toast.info("Требуется пароль двухфакторной аутентификации");
          return;
        }
      }
      
      toast.error(errorMessage);
      console.error("Sign in error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep("phone");
    setCode("");
    setPassword("");
    setNeedsPassword(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background with gradient */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          background: 'linear-gradient(135deg, hsl(210 60% 70%), hsl(195 70% 75%))',
        }}
      >
        <div className="absolute inset-0 backdrop-blur-3xl bg-background/40" />
      </div>

      {/* Animated glow effects */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />

      <div className="w-full max-w-md relative z-10">
        <GlassCard className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 gradient-text">
              Добро пожаловать
            </h1>
            <p className="text-muted-foreground">
              {step === "phone" 
                ? "Введите номер телефона для входа" 
                : "Введите код подтверждения из Telegram"}
            </p>
          </div>

          {step === "phone" ? (
            <form onSubmit={handlePhoneSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="phone">Номер телефона</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+7 (999) 123-45-67"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                    className="pl-10"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading || !phoneNumber}
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Отправка...
                  </>
                ) : (
                  "Отправить код"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="code">Код подтверждения</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                  <Input
                    id="code"
                    type="text"
                    placeholder="12345"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    className="pl-10 text-center text-2xl tracking-widest"
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Код отправлен на {phoneNumber}
                </p>
              </div>

              {needsPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password">Пароль 2FA</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Введите пароль"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      disabled={loading}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button 
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleBack}
                  disabled={loading}
                >
                  Назад
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1" 
                  disabled={loading || !code}
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Вход...
                    </>
                  ) : (
                    "Войти"
                  )}
                </Button>
              </div>
            </form>
          )}
        </GlassCard>
      </div>
    </div>
  );
}


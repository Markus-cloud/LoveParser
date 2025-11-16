import { useState, useEffect } from "react";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useApi } from "@/lib/api";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface BroadcastHistoryItem {
  id: string;
  message: string;
  createdAt: number;
  status: 'completed' | 'failed' | 'partial';
  audienceName: string;
  mode: string;
  successCount: number;
  failedCount: number;
  totalCount: number;
}

interface BroadcastHistoryProps {
  refreshTrigger?: number;
}

export function BroadcastHistory({ refreshTrigger }: BroadcastHistoryProps) {
  const { toast } = useToast();
  const api = useApi();
  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<BroadcastHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [audienceFilter, setAudienceFilter] = useState<string>("all");

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/telegram/broadcast-history') as { history: BroadcastHistoryItem[] };
      setHistory(response.history || []);
    } catch (err) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить историю рассылок",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  useEffect(() => {
    let filtered = [...history];

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter(item => item.status === statusFilter);
    }

    // Filter by date range
    if (dateFrom) {
      const fromTimestamp = new Date(dateFrom).getTime();
      filtered = filtered.filter(item => item.createdAt >= fromTimestamp);
    }
    if (dateTo) {
      const toTimestamp = new Date(dateTo).getTime() + 86400000; // Add 1 day to include the end date
      filtered = filtered.filter(item => item.createdAt < toTimestamp);
    }

    // Filter by audience
    if (audienceFilter !== "all") {
      filtered = filtered.filter(item => item.audienceName === audienceFilter);
    }

    setFilteredHistory(filtered);
  }, [history, statusFilter, dateFrom, dateTo, audienceFilter]);

  const handleDownload = async (id: string) => {
    try {
      await api.download(`/telegram/broadcast-history/${id}/download`);
      toast({
        title: "Успешно",
        description: "CSV файл загружен",
      });
    } catch (err) {
      toast({
        title: "Ошибка",
        description: "Не удалось скачать файл",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'partial':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">Выполнено</Badge>;
      case 'failed':
        return <Badge variant="destructive">Ошибка</Badge>;
      case 'partial':
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Частично</Badge>;
      default:
        return <Badge variant="outline">Неизвестно</Badge>;
    }
  };

  const uniqueAudiences = Array.from(new Set(history.map(item => item.audienceName)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">История рассылок</h2>
        <Button
          onClick={fetchHistory}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="glass-card border-white/20"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      {/* Filters */}
      <GlassCard className="space-y-4">
        <h3 className="font-semibold text-sm">Фильтры</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs">Статус</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="glass-card border-white/20 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-card glass-effect">
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="completed">Выполнено</SelectItem>
                <SelectItem value="partial">Частично</SelectItem>
                <SelectItem value="failed">Ошибка</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Дата от</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="glass-card border-white/20 mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Дата до</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="glass-card border-white/20 mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Аудитория</Label>
            <Select value={audienceFilter} onValueChange={setAudienceFilter}>
              <SelectTrigger className="glass-card border-white/20 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-card glass-effect">
                <SelectItem value="all">Все</SelectItem>
                {uniqueAudiences.map(audience => (
                  <SelectItem key={audience} value={audience}>{audience}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </GlassCard>

      {/* History List */}
      {filteredHistory.length === 0 ? (
        <GlassCard className="text-center py-12">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            {history.length === 0 
              ? "История рассылок пуста" 
              : "Нет рассылок, соответствующих фильтрам"}
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredHistory.map((item) => (
            <GlassCard key={item.id} hover className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(item.status)}
                    {getStatusBadge(item.status)}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {item.message.length > 50 
                      ? `${item.message.substring(0, 50)}...` 
                      : item.message}
                  </p>
                </div>
                <Button
                  onClick={() => handleDownload(item.id)}
                  size="sm"
                  variant="outline"
                  className="glass-card border-white/20 flex-shrink-0"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(item.createdAt), "dd MMM yyyy HH:mm", { locale: ru })}
                </div>
                <span>•</span>
                <span className="font-medium">{item.audienceName}</span>
                <span>•</span>
                <span className="text-green-500">✓ {item.successCount}</span>
                {item.failedCount > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-red-500">✗ {item.failedCount}</span>
                  </>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

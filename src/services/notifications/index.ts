// Delivery is queued transactionally in PostgreSQL and performed by Edge Functions.
// Client code never sends provider credentials or treats queued work as delivered.
export type NotificationChannel = 'EMAIL' | 'WHATSAPP';
export interface NotificationMessage { reservationCode: string; venue: string; date: string; time: string; lane: number }
export interface NotificationAdapter { send(message: NotificationMessage): Promise<void> }

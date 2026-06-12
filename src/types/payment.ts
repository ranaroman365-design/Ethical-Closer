export interface PaymentLink {
  id: string;
  token: string;
  lead_id: string;
  closer_id: string;
  deal_type: DealType;
  payment_type: 'one_time' | 'split_3';
  secondary_method: SecondaryMethod;
  amount: number;
  installment_amount?: number;
  installment_count?: number;
  currency: 'EUR';
  status: 'pending' | 'opened' | 'paid' | 'failed' | 'expired';
  session_id?: string;
  payment_url?: string;
  first_name: string;
  email: string;
  offer_title: string;
  created_at: string;
  expires_at: string;
}

export type DealType =
  | 'starter_one_time' | 'starter_split_3'
  | 'closer_one_time'  | 'closer_split_3'
  | 'highticket_one_time' | 'highticket_split_3';

export type SecondaryMethod = 'stripe' | 'klarna' | 'iban' | 'digistore' | 'paypal';

export type PaymentMethod = 'apple_pay' | 'stripe' | 'klarna' | 'iban' | 'digistore' | 'paypal';

export interface PaymentLinkGeneratorProps {
  leadId: string;
  leadName: string;
  leadEmail: string;
  closerId: string;
  onLinkGenerated?: (token: string, url: string) => void;
}

export interface CheckoutPageProps {
  token: string;
}

/**
 * Currency expiring — fires when a student or instructor currency
 * (BFR, IPC, medical, etc.) is within its expiry window.
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface CurrencyExpiringProps {
  recipientName: string;
  currencyKind: string;
  daysUntilExpiry: number;
  profileUrl: string;
}

export function CurrencyExpiring(props: CurrencyExpiringProps) {
  return (
    <EmailShell heading="Currency expiring soon" footerCategory="currency expiry">
      <Text>Hi {props.recipientName},</Text>
      <Text>
        Your <strong>{props.currencyKind}</strong> currency expires in{' '}
        <strong>{props.daysUntilExpiry} days</strong>. Schedule a renewal flight soon to keep your
        training on track.
      </Text>
      <Button
        href={props.profileUrl}
        style={{
          background: '#1e40af',
          color: '#ffffff',
          padding: '10px 16px',
          borderRadius: 4,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Review currency
      </Button>
    </EmailShell>
  );
}

export default CurrencyExpiring;

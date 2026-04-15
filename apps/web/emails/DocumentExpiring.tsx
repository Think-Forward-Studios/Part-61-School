/**
 * Document expiring — fires to the document owner when a medical,
 * license, or ID is approaching expiry (≤30d).
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface DocumentExpiringProps {
  recipientName: string;
  documentKind: string;
  daysUntilExpiry: number;
  profileUrl: string;
}

export function DocumentExpiring(props: DocumentExpiringProps) {
  return (
    <EmailShell heading="Document expiring soon" footerCategory="document expiry">
      <Text>Hi {props.recipientName},</Text>
      <Text>
        Your <strong>{props.documentKind}</strong> expires in{' '}
        <strong>{props.daysUntilExpiry} days</strong>. Please upload a renewal before the expiry
        date to avoid a flight hold.
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
        Update documents
      </Button>
    </EmailShell>
  );
}

export default DocumentExpiring;

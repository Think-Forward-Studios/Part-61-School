/**
 * Squawk opened — fires to the mechanic queue + assigned instructors
 * on the aircraft when a new squawk is logged.
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface SquawkOpenedProps {
  recipientName: string;
  aircraftTail: string;
  squawkTitle: string;
  severity: 'info' | 'watch' | 'grounding';
  squawkUrl: string;
}

export function SquawkOpened(props: SquawkOpenedProps) {
  return (
    <EmailShell heading="New squawk logged" footerCategory="squawk">
      <Text>Hi {props.recipientName},</Text>
      <Text>
        A new squawk was opened on <strong>{props.aircraftTail}</strong>:
      </Text>
      <Text style={{ padding: 12, background: '#f3f4f6', borderRadius: 4 }}>
        <strong>{props.squawkTitle}</strong>
        <br />
        Severity: {props.severity}
      </Text>
      <Button
        href={props.squawkUrl}
        style={{
          background: '#1e40af',
          color: '#ffffff',
          padding: '10px 16px',
          borderRadius: 4,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        View squawk
      </Button>
    </EmailShell>
  );
}

export default SquawkOpened;

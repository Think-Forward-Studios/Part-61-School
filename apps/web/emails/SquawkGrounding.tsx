/**
 * Squawk grounding — SAFETY CRITICAL. Fires to students, instructors,
 * and mechanics when an aircraft is grounded by a squawk.
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface SquawkGroundingProps {
  recipientName: string;
  aircraftTail: string;
  squawkTitle: string;
  squawkUrl: string;
}

export function SquawkGrounding(props: SquawkGroundingProps) {
  return (
    <EmailShell heading="Aircraft grounded — do not fly" footerCategory="safety-critical">
      <Text>Hi {props.recipientName},</Text>
      <Text
        style={{
          background: '#fee2e2',
          color: '#991b1b',
          padding: 12,
          borderRadius: 4,
          fontWeight: 600,
        }}
      >
        Do not fly <strong>{props.aircraftTail}</strong> — grounded pending repair.
      </Text>
      <Text>
        Reason: <strong>{props.squawkTitle}</strong>
      </Text>
      <Button
        href={props.squawkUrl}
        style={{
          background: '#991b1b',
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

export default SquawkGrounding;

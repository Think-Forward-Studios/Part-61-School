/**
 * Reservation requested — fires to the instructor (or admin) when a
 * student requests a reservation that awaits approval.
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface ReservationRequestedProps {
  recipientName: string;
  studentName: string;
  aircraftTail: string;
  startTimeLocal: string;
  reservationUrl: string;
}

export function ReservationRequested(props: ReservationRequestedProps) {
  return (
    <EmailShell heading="New reservation request" footerCategory="reservation">
      <Text>Hi {props.recipientName},</Text>
      <Text>
        <strong>{props.studentName}</strong> has requested a reservation in{' '}
        <strong>{props.aircraftTail}</strong> on {props.startTimeLocal}.
      </Text>
      <Text>It is awaiting your decision.</Text>
      <Button
        href={props.reservationUrl}
        style={{
          background: '#1e40af',
          color: '#ffffff',
          padding: '10px 16px',
          borderRadius: 4,
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Review request
      </Button>
    </EmailShell>
  );
}

export default ReservationRequested;

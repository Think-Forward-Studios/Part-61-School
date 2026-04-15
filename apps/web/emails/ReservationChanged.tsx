/**
 * Reservation changed — fires when reservation details are updated
 * (time, aircraft, instructor, etc.).
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface ReservationChangedProps {
  recipientName: string;
  aircraftTail: string;
  oldStartTimeLocal: string;
  newStartTimeLocal: string;
  reservationUrl: string;
}

export function ReservationChanged(props: ReservationChangedProps) {
  return (
    <EmailShell heading="Your reservation was updated" footerCategory="reservation">
      <Text>Hi {props.recipientName},</Text>
      <Text>
        Your reservation in <strong>{props.aircraftTail}</strong> has moved from{' '}
        {props.oldStartTimeLocal} to <strong>{props.newStartTimeLocal}</strong>.
      </Text>
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
        View reservation
      </Button>
    </EmailShell>
  );
}

export default ReservationChanged;

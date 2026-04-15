/**
 * 24-hour reservation reminder — fired by the pg_cron job registered
 * in migration 0035. Subject: "Reservation tomorrow".
 */
import { Button, Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface ReservationReminder24hProps {
  recipientName: string;
  aircraftTail?: string;
  startTimeLocal: string;
  reservationUrl: string;
}

export function ReservationReminder24h(props: ReservationReminder24hProps) {
  return (
    <EmailShell heading="Reservation in ~24 hours" footerCategory="reservation reminder">
      <Text>Hi {props.recipientName},</Text>
      <Text>
        Reminder: your reservation
        {props.aircraftTail ? (
          <>
            {' '}
            in <strong>{props.aircraftTail}</strong>
          </>
        ) : null}{' '}
        is at <strong>{props.startTimeLocal}</strong> — about 24 hours away.
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

export default ReservationReminder24h;

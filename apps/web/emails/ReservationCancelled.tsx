/**
 * Reservation cancelled — fires to affected parties (student, instructor)
 * when a reservation is cancelled.
 */
import { Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface ReservationCancelledProps {
  recipientName: string;
  aircraftTail: string;
  startTimeLocal: string;
  cancelledBy: string;
  reason?: string;
}

export function ReservationCancelled(props: ReservationCancelledProps) {
  return (
    <EmailShell heading="Reservation cancelled" footerCategory="reservation">
      <Text>Hi {props.recipientName},</Text>
      <Text>
        The reservation in <strong>{props.aircraftTail}</strong> on {props.startTimeLocal} was
        cancelled by <strong>{props.cancelledBy}</strong>.
      </Text>
      {props.reason ? (
        <Text>
          <strong>Reason:</strong> {props.reason}
        </Text>
      ) : null}
    </EmailShell>
  );
}

export default ReservationCancelled;

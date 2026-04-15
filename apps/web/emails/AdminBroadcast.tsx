/**
 * Admin broadcast — fires to every recipient of an admin broadcast
 * (MSG-02). Shown alongside the in-app pinned banner.
 */
import { Text } from '@react-email/components';
import { EmailShell } from './_components/EmailShell';

export interface AdminBroadcastProps {
  title: string;
  body: string;
  urgency: 'normal' | 'urgent';
  senderName: string;
}

export function AdminBroadcast(props: AdminBroadcastProps) {
  const isUrgent = props.urgency === 'urgent';
  return (
    <EmailShell
      heading={isUrgent ? `Urgent: ${props.title}` : props.title}
      footerCategory="admin broadcast"
    >
      <Text>From {props.senderName}</Text>
      <Text
        style={
          isUrgent
            ? {
                background: '#fee2e2',
                color: '#991b1b',
                padding: 12,
                borderRadius: 4,
                fontWeight: 600,
              }
            : {
                padding: 12,
                background: '#f3f4f6',
                borderRadius: 4,
              }
        }
      >
        {props.body}
      </Text>
    </EmailShell>
  );
}

export default AdminBroadcast;

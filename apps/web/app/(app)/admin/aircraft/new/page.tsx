import { CreateAircraftForm } from './CreateAircraftForm';

export default function NewAircraftPage() {
  return (
    <main style={{ padding: '1rem', maxWidth: 720 }}>
      <h1>Add Aircraft</h1>
      <p>Creates the aircraft plus an initial baseline flight log entry with the clocks you enter.</p>
      <CreateAircraftForm />
    </main>
  );
}

import { CreatePersonForm } from './CreatePersonForm';

export default function NewPersonPage() {
  return (
    <main style={{ padding: '1rem', maxWidth: 720 }}>
      <h1>Create Person</h1>
      <p>
        Creates a user, sends an invitation email, and builds their profile. The
        user will be able to set their password from the invite link.
      </p>
      <CreatePersonForm />
    </main>
  );
}

import { RegisterForm } from './RegisterForm';

export default function RegisterPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: 520, margin: '0 auto' }}>
      <h1>Register</h1>
      <p>
        Request an account. Your submission will be reviewed by a school
        administrator, who will send you an invitation email to set your password.
      </p>
      <RegisterForm />
    </main>
  );
}

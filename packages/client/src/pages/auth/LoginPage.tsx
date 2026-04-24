import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../../stores/auth';
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  FormError,
  Input,
} from '../../components/ui';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const storeError = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values.email, values.password);
      navigate('/dashboard');
    } catch {
      /* shown via store error */
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-app">
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold">
            C
          </div>
          <span className="text-xl font-semibold tracking-tight text-text-primary">
            CloserAI
          </span>
        </div>
        <h1 className="text-2xl font-semibold mb-2 text-text-primary">Welcome back</h1>
        <p className="text-sm text-text-muted mb-6">Sign in to your workspace.</p>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? 'true' : 'false'}
              {...register('email')}
            />
            <FieldError>{errors.email?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? 'true' : 'false'}
              {...register('password')}
            />
            <FieldError>{errors.password?.message}</FieldError>
          </Field>
          <FormError>{storeError}</FormError>
          <Button
            type="submit"
            className="w-full justify-center"
            size="lg"
            loading={isSubmitting}
            disabled={!isValid || isSubmitting}
          >
            Sign in
          </Button>
        </form>
        <p className="text-sm text-text-muted mt-6 text-center">
          No account?{' '}
          <Link
            to="/register"
            className="text-brand-600 dark:text-brand-300 font-medium hover:underline"
          >
            Start free trial
          </Link>
        </p>
      </div>
    </div>
  );
}

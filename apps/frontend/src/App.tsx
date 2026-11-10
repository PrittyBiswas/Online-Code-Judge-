import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/HomePage';
import { useHealthCheck } from './hooks/useHealthCheck';

export function App() {
  const { status, data } = useHealthCheck();

  return (
    <MainLayout apiStatus={status}>
      <HomePage apiStatus={status} healthData={data} />
    </MainLayout>
  );
}

export default App;

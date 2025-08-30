'use client';
import { useEffect } from "react";
import { useRouter } from 'next/navigation';

const LoadingPage = () => {

  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      const storedInfo = localStorage.getItem("userInformation");
      const storedAnswers = localStorage.getItem("answers");
      const storedTime = localStorage.getItem("sendTime");

      if (storedInfo && storedAnswers && storedTime) {
        router.replace('/Explanation');
      }
    }, 500);

    return () => clearInterval(interval);
  }, [router]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <p>データを送信中です。</p>
      <p>しばらくお待ちください...</p>
    </div>
  );
};

export default LoadingPage;
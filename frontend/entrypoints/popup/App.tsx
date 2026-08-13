import styles from "./App.module.css";

export function App() {
  return (
    <div className={styles.popup}>
      <header className={styles.header}>
        <h1>Career Form</h1>
      </header>
      <main className={styles.main}>
        <p>지원 정보를 안전하게 준비할 수 있도록 도와드립니다.</p>
      </main>
      <footer className={styles.footer}>
        자동 입력 전 항상 내용을 확인하세요.
      </footer>
    </div>
  );
}

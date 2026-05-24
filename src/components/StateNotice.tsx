import styles from "./StateNotice.module.css";

type StateNoticeTone = "empty" | "loading" | "error" | "success";

type StateNoticeProps = {
  title: string;
  description: string;
  tone?: StateNoticeTone;
};

export function StateNotice({ title, description, tone = "empty" }: StateNoticeProps) {
  return (
    <section className={styles.notice} data-tone={tone} aria-live={tone === "error" ? "assertive" : "polite"}>
      <span className={styles.indicator} aria-hidden="true" />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </section>
  );
}

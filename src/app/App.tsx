import { StateNotice } from "../components/StateNotice";
import styles from "./App.module.css";

const navigationGroups = ["全部", "正在生效", "即将结束", "已结束待清货", "历史记录"];
const supplierFilters = ["LAYBROTHERS", "ETTASON", "ORIENTAL_MERCHANT", "TAIWANESE_OVERSEAS", "ROCKMAN"];
const specialTypes = ["日常特价", "每周特价", "快速清货"];

export function App() {
  const isLoading = false;
  const errorMessage = "";
  const hasSeries = false;

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            SO
          </span>
          <div>
            <p className={styles.eyebrow}>Special Organizer</p>
            <h1>特价系列工作台</h1>
          </div>
        </div>
        <div className={styles.searchRow} aria-label="全局筛选">
          <label className={styles.searchBox}>
            <span>搜索</span>
            <input type="search" placeholder="供应商或系列名称" disabled />
          </label>
          <select aria-label="特价类型筛选" disabled defaultValue="">
            <option value="">全部类型</option>
          </select>
          <select aria-label="供应商筛选" disabled defaultValue="">
            <option value="">全部供应商</option>
          </select>
          <button type="button" disabled>
            新建系列
          </button>
        </div>
      </header>

      <section className={styles.workspace} aria-label="应用工作台">
        <aside className={styles.sidebar} aria-label="状态导航">
          <h2>生命周期</h2>
          <nav className={styles.navList}>
            {navigationGroups.map((item) => (
              <button key={item} type="button" disabled>
                <span>{item}</span>
                <span className={styles.count}>0</span>
              </button>
            ))}
          </nav>

          <div className={styles.filterBlock}>
            <h3>供应商</h3>
            <div className={styles.chipList}>
              {supplierFilters.map((supplier) => (
                <span key={supplier}>{supplier}</span>
              ))}
            </div>
          </div>

          <div className={styles.filterBlock}>
            <h3>特价类型</h3>
            <div className={styles.chipList}>
              {specialTypes.map((type) => (
                <span key={type}>{type}</span>
              ))}
            </div>
          </div>
        </aside>

        <section className={styles.centerPane} aria-label="日历和任务列表">
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>日历</p>
                <h2>任务日历</h2>
              </div>
              <span className={styles.statusPill}>空状态</span>
            </div>
            <div className={styles.calendarGrid} aria-label="空日历">
              {Array.from({ length: 35 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>任务</p>
                <h2>列表式任务栏</h2>
              </div>
              <span className={styles.statusPill}>0 项</span>
            </div>
            {isLoading ? (
              <StateNotice title="正在加载" description="正在读取本地特价系列。" tone="loading" />
            ) : errorMessage ? (
              <StateNotice title="加载失败" description={errorMessage} tone="error" />
            ) : hasSeries ? null : (
              <StateNotice title="暂无特价系列" description="创建第一条记录后，这里会显示选定日期的跟进任务。" />
            )}
          </div>
        </section>

        <aside className={styles.detailPane} aria-label="系列详情">
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>详情</p>
                <h2>系列详情</h2>
              </div>
            </div>
            <StateNotice title="未选择系列" description="从搜索结果、日历或任务栏选择一条记录后编辑。" />
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>报告</p>
                <h2>报告入口</h2>
              </div>
            </div>
            <StateNotice title="暂无提醒" description="符合结束提醒条件的系列会显示在这里。" />
          </div>
        </aside>
      </section>
    </main>
  );
}

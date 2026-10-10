import HomeBookshelf from "@/components/layout/navigation/HomeBookshelf";

// 首页 · 书架：每个科目一本「书」。学年由客户端「切换学年」过滤，大一文件仍保留在磁盘。
export default function HomePage() {
  return <HomeBookshelf />;
}

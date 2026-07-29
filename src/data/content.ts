import thumbFunny from "@/assets/thumb-funny.jpg";
import thumbMusic from "@/assets/thumb-music.jpg";
import thumbSports from "@/assets/thumb-sports.jpg";
import thumbLearning from "@/assets/thumb-learning.jpg";
import thumbExperience from "@/assets/thumb-experience.jpg";
import thumbSerious from "@/assets/thumb-serious.jpg";

export const CATEGORIES = [
  "Funny",
  "Music",
  "Experience",
  "Sports",
  "Learning",
  "Serious Topics",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type VideoPost = {
  id: string;
  title: string;
  category: Category;
  thumbnail: string;
  duration: string;
  views: string;
  likes: string;
  comments: string;
  postedAt: string;
  creator: {
    name: string;
    handle: string;
    location: string;
    initials: string;
  };
};

export const VIDEOS: VideoPost[] = [
  {
    id: "v1",
    title: "When the danfo conductor gives you change in sweets",
    category: "Funny",
    thumbnail: thumbFunny,
    duration: "0:48",
    views: "128K",
    likes: "14.2K",
    comments: "812",
    postedAt: "2h ago",
    creator: { name: "Tunde Bright", handle: "@tundebright", location: "Lagos, NG", initials: "TB" },
  },
  {
    id: "v2",
    title: "Live afrobeats set from the rooftop in Accra",
    category: "Music",
    thumbnail: thumbMusic,
    duration: "3:12",
    views: "402K",
    likes: "58.7K",
    comments: "2.1K",
    postedAt: "5h ago",
    creator: { name: "Ama Serwaa", handle: "@amaserwaa", location: "Accra, GH", initials: "AS" },
  },
  {
    id: "v3",
    title: "Sunrise over the Rift Valley — three days on the road",
    category: "Experience",
    thumbnail: thumbExperience,
    duration: "2:05",
    views: "76K",
    likes: "9.4K",
    comments: "435",
    postedAt: "9h ago",
    creator: { name: "Kito Mwangi", handle: "@kitoroams", location: "Nakuru, KE", initials: "KM" },
  },
  {
    id: "v4",
    title: "Street football finals — last minute winner",
    category: "Sports",
    thumbnail: thumbSports,
    duration: "1:22",
    views: "219K",
    likes: "31.8K",
    comments: "1.6K",
    postedAt: "12h ago",
    creator: { name: "Baba Sule", handle: "@sulefc", location: "Kano, NG", initials: "BS" },
  },
  {
    id: "v5",
    title: "Build your first web app in 10 minutes",
    category: "Learning",
    thumbnail: thumbLearning,
    duration: "9:58",
    views: "94K",
    likes: "12.6K",
    comments: "704",
    postedAt: "1d ago",
    creator: { name: "Zainab Musa", handle: "@zaicodes", location: "Abuja, NG", initials: "ZM" },
  },
  {
    id: "v6",
    title: "What youth unemployment really costs our cities",
    category: "Serious Topics",
    thumbnail: thumbSerious,
    duration: "6:41",
    views: "58K",
    likes: "7.9K",
    comments: "1.2K",
    postedAt: "1d ago",
    creator: { name: "Kwame Osei", handle: "@kwameosei", location: "Kumasi, GH", initials: "KO" },
  },
];

export type Creator = {
  name: string;
  handle: string;
  initials: string;
  category: Category;
  followers: string;
};

export const CREATORS: Creator[] = [
  { name: "Ama Serwaa", handle: "@amaserwaa", initials: "AS", category: "Music", followers: "182K" },
  { name: "Tunde Bright", handle: "@tundebright", initials: "TB", category: "Funny", followers: "96K" },
  { name: "Zainab Musa", handle: "@zaicodes", initials: "ZM", category: "Learning", followers: "74K" },
  { name: "Kito Mwangi", handle: "@kitoroams", initials: "KM", category: "Experience", followers: "51K" },
  { name: "Baba Sule", handle: "@sulefc", initials: "BS", category: "Sports", followers: "43K" },
  { name: "Kwame Osei", handle: "@kwameosei", initials: "KO", category: "Serious Topics", followers: "38K" },
];

export type Notification = {
  id: string;
  type: "like" | "comment" | "follow" | "system";
  actor: string;
  text: string;
  time: string;
  unread: boolean;
};

export const NOTIFICATIONS: Notification[] = [
  { id: "n1", type: "like", actor: "Ama Serwaa", text: "liked your video “Market run at 6am”", time: "12m", unread: true },
  { id: "n2", type: "comment", actor: "Baba Sule", text: "commented: “This edit is clean 🔥”", time: "48m", unread: true },
  { id: "n3", type: "follow", actor: "Zainab Musa", text: "started following you", time: "3h", unread: true },
  { id: "n4", type: "system", actor: "KC Earn", text: "Your upload finished processing and is now live", time: "6h", unread: false },
  { id: "n5", type: "like", actor: "Kito Mwangi", text: "liked your video “Rooftop sessions”", time: "1d", unread: false },
  { id: "n6", type: "comment", actor: "Kwame Osei", text: "replied to your comment on “City stories”", time: "2d", unread: false },
];

export const PROFILE = {
  name: "Chidera Nwosu",
  handle: "@chidera",
  initials: "CN",
  location: "Enugu, Nigeria",
  bio: "Documenting everyday street stories across West Africa. Camera in one hand, jollof in the other.",
  stats: { posts: "42", followers: "18.4K", following: "312" },
};

import { Link } from "react-router-dom";
import { PRODUCT } from '@/config/product';

const FunnelFooter = () => (
  <footer className="py-12 bg-funnel-dark text-white/40">
    <div className="container mx-auto max-w-3xl px-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 font-sans text-xs">
        <span>© {new Date().getFullYear()} {PRODUCT.nameTM} by {PRODUCT.brand}</span>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link to="/legal-notice" className="hover:text-white/70 transition-colors">Legal Notice</Link>
          <Link to="/privacy" className="hover:text-white/70 transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-white/70 transition-colors">Terms</Link>
          <Link to="/refund-policy" className="hover:text-white/70 transition-colors">Refund</Link>
          <Link to="/cookie-policy" className="hover:text-white/70 transition-colors">Cookies</Link>
        </div>
      </div>
    </div>
  </footer>
);

export default FunnelFooter;

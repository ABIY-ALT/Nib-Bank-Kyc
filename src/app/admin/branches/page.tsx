import { Button } from "@/components/ui/button"
import { Building2, Plus, MapPin } from "lucide-react"

export default function BranchesDistrictsPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Branches & Districts</h1>
          <p className="text-muted-foreground">Configure the bank's organizational hierarchy.</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Add Branch
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="p-6 border rounded-lg bg-card space-y-4">
          <div className="flex items-center gap-2 font-bold">
            <MapPin className="w-5 h-5 text-primary" />
            Districts
          </div>
          <div className="space-y-2 text-sm">
            <div className="p-2 border rounded">Central District (Headquarters)</div>
            <div className="p-2 border rounded">Northern District</div>
            <div className="p-2 border rounded">Southern District</div>
          </div>
        </div>

        <div className="p-6 border rounded-lg bg-card space-y-4">
          <div className="flex items-center gap-2 font-bold">
            <Building2 className="w-5 h-5 text-primary" />
            Branches
          </div>
          <div className="space-y-2 text-sm">
            <div className="p-2 border rounded">Downtown Branch (Central)</div>
            <div className="p-2 border rounded">Uptown Branch (Central)</div>
            <div className="p-2 border rounded">East Side Branch (Central)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

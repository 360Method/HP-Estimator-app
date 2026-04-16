/**
 * PropertySelectorGrid
 * Shows all properties for a customer.
 * - Single property: skips the grid and calls onSelect immediately (via useEffect in parent)
 * - Multiple properties: renders a grid of PropertyCards
 * - Includes "Add Property" button
 * - Handles enroll/manage membership dialogs
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import PropertyCard from "@/components/PropertyCard";
import PropertyFormDialog from "@/components/PropertyFormDialog";
import MembershipEnrollDialog from "@/components/MembershipEnrollDialog";
import MembershipManagePanel from "@/components/MembershipManagePanel";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { Property } from "@/lib/types";
import { toast } from 'sonner';
// useToast replaced with sonner

interface PropertySelectorGridProps {
  customerId: string;
  activePropertyId?: string | null;
  onSelectProperty: (property: Property) => void;
  /** Called after auto-migration creates the first property */
  onAutoMigrated?: (property: Property) => void;
  /** Customer's flat address fields for auto-migration */
  customerAddress?: {
    street: string;
    unit: string;
    city: string;
    state: string;
    zip: string;
    addressNotes?: string;
  };
}

export default function PropertySelectorGrid({
  customerId,
  activePropertyId,
  onSelectProperty,
  onAutoMigrated,
  customerAddress,
}: PropertySelectorGridProps) {
  
  const utils = trpc.useUtils();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editPropertyId, setEditPropertyId] = useState<string | null>(null);
  const [enrollPropertyId, setEnrollPropertyId] = useState<string | null>(null);
  const [manageMembershipId, setManageMembershipId] = useState<string | null>(null);

  const { data: properties = [], isLoading } = trpc.properties.listByCustomer.useQuery(
    { customerId },
    { enabled: !!customerId }
  );

  const autoMigrate = trpc.properties.autoMigrateFromCustomer.useMutation({
    onSuccess: (prop) => {
      utils.properties.listByCustomer.invalidate({ customerId });
      onAutoMigrated?.(prop as unknown as Property);
    },
  });

  const deleteMutation = trpc.properties.delete.useMutation({
    onSuccess: () => {
      utils.properties.listByCustomer.invalidate({ customerId });
      toast.success("Property deleted");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const setPrimaryMutation = trpc.properties.setPrimary.useMutation({
    onSuccess: () => {
      utils.properties.listByCustomer.invalidate({ customerId });
      toast.success("Primary address updated");
    },
  });

  // Auto-migrate: if no properties exist and customer has a flat address, create one silently
  useEffect(() => {
    if (
      !isLoading &&
      properties.length === 0 &&
      customerAddress?.street &&
      !autoMigrate.isPending
    ) {
      autoMigrate.mutate({
        customerId,
        street: customerAddress.street,
        unit: customerAddress.unit ?? "",
        city: customerAddress.city ?? "",
        state: customerAddress.state ?? "",
        zip: customerAddress.zip ?? "",
        addressNotes: customerAddress.addressNotes,
      });
    }
  }, [isLoading, properties.length, customerAddress?.street]);

  if (isLoading || autoMigrate.isPending) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading properties…
      </div>
    );
  }

  const editingProperty = editPropertyId
    ? properties.find((p) => p.id === editPropertyId) ?? null
    : null;

  const enrollProperty = enrollPropertyId
    ? properties.find((p) => p.id === enrollPropertyId) ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* Grid of property cards */}
      {properties.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {properties.map((prop) => (
            <PropertyCard
              key={prop.id}
              property={prop as unknown as Property}
              isActive={prop.id === activePropertyId}
              onSelect={(id) => {
                const p = properties.find((x) => x.id === id);
                if (p) onSelectProperty(p as unknown as Property);
              }}
              onEdit={(id) => setEditPropertyId(id)}
              onDelete={(id) => {
                if (confirm("Delete this property? This cannot be undone.")) {
                  deleteMutation.mutate({ id });
                }
              }}
              onSetPrimary={(id) =>
                setPrimaryMutation.mutate({ id, customerId })
              }
              onEnroll={(id) => setEnrollPropertyId(id)}
              onManageMembership={(id) => setManageMembershipId(id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No properties on file for this customer.
        </div>
      )}

      {/* Add property button */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditPropertyId(null);
            setShowAddForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add property
        </Button>
      </div>

      {/* Add / Edit property dialog */}
      {(showAddForm || editPropertyId) && (
        <PropertyFormDialog
          customerId={customerId}
          property={editingProperty as unknown as Property | null}
          open={showAddForm || !!editPropertyId}
          onClose={() => {
            setShowAddForm(false);
            setEditPropertyId(null);
          }}
          onSaved={() => {
            utils.properties.listByCustomer.invalidate({ customerId });
            setShowAddForm(false);
            setEditPropertyId(null);
          }}
        />
      )}

      {/* Enroll in 360° dialog */}
      {enrollProperty && (
        <MembershipEnrollDialog
          property={enrollProperty as unknown as Property}
          open={!!enrollPropertyId}
          onClose={() => setEnrollPropertyId(null)}
          onEnrolled={() => {
            utils.properties.listByCustomer.invalidate({ customerId });
            setEnrollPropertyId(null);
            toast.success("Enrolled in 360° — Membership activated.");
          }}
        />
      )}

      {/* Manage active membership panel */}
      {manageMembershipId && (() => {
        const manageProp = properties.find((p) => p.id === manageMembershipId);
        return manageProp ? (
          <MembershipManagePanel
            property={manageProp as unknown as Property}
            open={!!manageMembershipId}
            onClose={() => setManageMembershipId(null)}
            onChanged={() => {
              utils.properties.listByCustomer.invalidate({ customerId });
              setManageMembershipId(null);
            }}
          />
        ) : null;
      })()}
    </div>
  );
}

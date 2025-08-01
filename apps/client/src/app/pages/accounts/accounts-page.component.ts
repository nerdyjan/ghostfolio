import { CreateAccountDto } from '@ghostfolio/api/app/account/create-account.dto';
import { TransferBalanceDto } from '@ghostfolio/api/app/account/transfer-balance.dto';
import { UpdateAccountDto } from '@ghostfolio/api/app/account/update-account.dto';
import { AccountDetailDialog } from '@ghostfolio/client/components/account-detail-dialog/account-detail-dialog.component';
import { GfAccountDetailDialogModule } from '@ghostfolio/client/components/account-detail-dialog/account-detail-dialog.module';
import { AccountDetailDialogParams } from '@ghostfolio/client/components/account-detail-dialog/interfaces/interfaces';
import { GfAccountsTableModule } from '@ghostfolio/client/components/accounts-table/accounts-table.module';
import { NotificationService } from '@ghostfolio/client/core/notification/notification.service';
import { DataService } from '@ghostfolio/client/services/data.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { User } from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';

import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Account as AccountModel } from '@prisma/client';
import { addIcons } from 'ionicons';
import { addOutline } from 'ionicons/icons';
import { DeviceDetectorService } from 'ngx-device-detector';
import { EMPTY, Subject, Subscription } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { GfCreateOrUpdateAccountDialogComponent } from './create-or-update-account-dialog/create-or-update-account-dialog.component';
import { GfTransferBalanceDialogComponent } from './transfer-balance/transfer-balance-dialog.component';

@Component({
  host: { class: 'has-fab page' },
  imports: [
    GfAccountDetailDialogModule,
    GfAccountsTableModule,
    MatButtonModule,
    RouterModule
  ],
  selector: 'gf-accounts-page',
  styleUrls: ['./accounts-page.scss'],
  templateUrl: './accounts-page.html'
})
export class GfAccountsPageComponent implements OnDestroy, OnInit {
  public accounts: AccountModel[];
  public deviceType: string;
  public hasImpersonationId: boolean;
  public hasPermissionToCreateAccount: boolean;
  public hasPermissionToUpdateAccount: boolean;
  public routeQueryParams: Subscription;
  public totalBalanceInBaseCurrency = 0;
  public totalValueInBaseCurrency = 0;
  public transactionCount = 0;
  public user: User;

  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private deviceService: DeviceDetectorService,
    private dialog: MatDialog,
    private impersonationStorageService: ImpersonationStorageService,
    private notificationService: NotificationService,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) {
    this.route.queryParams
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((params) => {
        if (params['accountId'] && params['accountDetailDialog']) {
          this.openAccountDetailDialog(params['accountId']);
        } else if (
          params['createDialog'] &&
          this.hasPermissionToCreateAccount
        ) {
          this.openCreateAccountDialog();
        } else if (params['editDialog']) {
          if (this.accounts) {
            const account = this.accounts.find(({ id }) => {
              return id === params['accountId'];
            });

            this.openUpdateAccountDialog(account);
          } else {
            this.router.navigate(['.'], { relativeTo: this.route });
          }
        } else if (params['transferBalanceDialog']) {
          this.openTransferBalanceDialog();
        }
      });

    addIcons({ addOutline });
  }

  public ngOnInit() {
    this.deviceType = this.deviceService.getDeviceInfo().deviceType;

    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((impersonationId) => {
        this.hasImpersonationId = !!impersonationId;
      });

    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          this.hasPermissionToCreateAccount = hasPermission(
            this.user.permissions,
            permissions.createAccount
          );
          this.hasPermissionToUpdateAccount = hasPermission(
            this.user.permissions,
            permissions.updateAccount
          );

          this.changeDetectorRef.markForCheck();
        }
      });

    this.fetchAccounts();
  }

  public fetchAccounts() {
    this.dataService
      .fetchAccounts()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(
        ({
          accounts,
          totalBalanceInBaseCurrency,
          totalValueInBaseCurrency,
          transactionCount
        }) => {
          this.accounts = accounts;
          this.totalBalanceInBaseCurrency = totalBalanceInBaseCurrency;
          this.totalValueInBaseCurrency = totalValueInBaseCurrency;
          this.transactionCount = transactionCount;

          if (this.accounts?.length <= 0) {
            this.router.navigate([], { queryParams: { createDialog: true } });
          }

          this.changeDetectorRef.markForCheck();
        }
      );
  }

  public onDeleteAccount(aId: string) {
    this.reset();

    this.dataService
      .deleteAccount(aId)
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntil(this.unsubscribeSubject))
          .subscribe();

        this.fetchAccounts();
      });
  }

  public onTransferBalance() {
    this.router.navigate([], {
      queryParams: { transferBalanceDialog: true }
    });
  }

  public onUpdateAccount(aAccount: AccountModel) {
    this.router.navigate([], {
      queryParams: { accountId: aAccount.id, editDialog: true }
    });
  }

  public openUpdateAccountDialog({
    balance,
    comment,
    currency,
    id,
    isExcluded,
    name,
    platformId
  }: AccountModel) {
    const dialogRef = this.dialog.open(GfCreateOrUpdateAccountDialogComponent, {
      data: {
        account: {
          balance,
          comment,
          currency,
          id,
          isExcluded,
          name,
          platformId
        }
      },
      height: this.deviceType === 'mobile' ? '98vh' : '80vh',
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((account: UpdateAccountDto | null) => {
        if (account) {
          this.reset();

          this.dataService
            .putAccount(account)
            .pipe(takeUntil(this.unsubscribeSubject))
            .subscribe(() => {
              this.userService
                .get(true)
                .pipe(takeUntil(this.unsubscribeSubject))
                .subscribe();

              this.fetchAccounts();
            });

          this.changeDetectorRef.markForCheck();
        }

        this.router.navigate(['.'], { relativeTo: this.route });
      });
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private openAccountDetailDialog(aAccountId: string) {
    const dialogRef = this.dialog.open(AccountDetailDialog, {
      autoFocus: false,
      data: {
        accountId: aAccountId,
        deviceType: this.deviceType,
        hasImpersonationId: this.hasImpersonationId,
        hasPermissionToCreateOrder:
          !this.hasImpersonationId &&
          hasPermission(this.user?.permissions, permissions.createOrder) &&
          !this.user?.settings?.isRestrictedView
      } as AccountDetailDialogParams,
      height: this.deviceType === 'mobile' ? '98vh' : '80vh',
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe(() => {
        this.fetchAccounts();

        this.router.navigate(['.'], { relativeTo: this.route });
      });
  }

  private openCreateAccountDialog() {
    const dialogRef = this.dialog.open(GfCreateOrUpdateAccountDialogComponent, {
      data: {
        account: {
          balance: 0,
          comment: null,
          currency: this.user?.settings?.baseCurrency,
          isExcluded: false,
          name: null,
          platformId: null
        }
      },
      height: this.deviceType === 'mobile' ? '98vh' : '80vh',
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((account: CreateAccountDto | null) => {
        if (account) {
          this.reset();

          this.dataService
            .postAccount(account)
            .pipe(takeUntil(this.unsubscribeSubject))
            .subscribe(() => {
              this.userService
                .get(true)
                .pipe(takeUntil(this.unsubscribeSubject))
                .subscribe();

              this.fetchAccounts();
            });

          this.changeDetectorRef.markForCheck();
        }

        this.router.navigate(['.'], { relativeTo: this.route });
      });
  }

  private openTransferBalanceDialog() {
    const dialogRef = this.dialog.open(GfTransferBalanceDialogComponent, {
      data: {
        accounts: this.accounts
      },
      width: this.deviceType === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((data: any) => {
        if (data) {
          this.reset();

          const { accountIdFrom, accountIdTo, balance }: TransferBalanceDto =
            data?.account;

          this.dataService
            .transferAccountBalance({
              accountIdFrom,
              accountIdTo,
              balance
            })
            .pipe(
              catchError(() => {
                this.notificationService.alert({
                  title: $localize`Oops, cash balance transfer has failed.`
                });

                return EMPTY;
              }),
              takeUntil(this.unsubscribeSubject)
            )
            .subscribe(() => {
              this.fetchAccounts();
            });

          this.changeDetectorRef.markForCheck();
        }

        this.router.navigate(['.'], { relativeTo: this.route });
      });
  }

  private reset() {
    this.accounts = undefined;
    this.totalBalanceInBaseCurrency = 0;
    this.totalValueInBaseCurrency = 0;
    this.transactionCount = 0;
  }
}

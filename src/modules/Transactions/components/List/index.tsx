import React, { PureComponent } from 'react';
import { withTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { createStyles, withStyles } from '@mui/styles';
import {
  providers,
  encoding,
  types,
  bcs,
} from '@starcoin/starcoin';
import eventBus from '@/utils/eventBus';
import { arrayify } from '@ethersproject/bytes';
import FileSaver from 'file-saver';
import Typography from '@mui/material/Typography';
import Loading from '@/common/Loading';
import ListView from '@/common/View/ListView';
import Pagination from '@/common/View/Pagination';
import CenteredView from '@/common/View/CenteredView';
import TransactionTable from '../Table';
import { withRouter,RoutedProps } from '@/utils/withRouter';
import { formatArgsWithTypeTag } from '../Detail/index'

const useStyles = (theme: any) => createStyles({
  pagerArea: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'flex-end',
    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : undefined,
    color: theme.palette.getContrastText(theme.palette.background.paper),
  },
  tit : {
    width: '200px',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    cursor: 'pointer',
  }
});

interface ExternalProps {
  className?: string,
}

interface InternalProps {
  transactionList: any,
  isLoadingMore: boolean,
  getTransactionList: (contents: any, callback?: any) => any,
  classes: any,
  t: any,
}

interface Props extends ExternalProps, InternalProps,RoutedProps {
  transaction: any;
}

interface IndexState {
  currentPage: number;
  resolvedFunction: any;
  selectMap: any;
}

class Index extends PureComponent<Props, IndexState> {
  // eslint-disable-next-line react/static-property-placement
  static defaultProps = {
    transactionList: null,
    isLoadingMore: undefined,
    getTransactionList: () => {
    },
  };

  constructor(props: Props) {
    super(props);
    this.state = {
      currentPage: 1,
      resolvedFunction: undefined,
      selectMap: {},
    };
  }
  


  componentDidMount() {
    const params = this.props.params;
    if(Number(params.page)){
      this.fetchListPage(Number(params.page));
    }else{
      this.fetchListPage(this.state.currentPage);
    }
    eventBus.addListener('seletRowBus', this.collection)
  }

  componentWillUnmount(){
    eventBus.removeListener('seletRowBus', this.collection)
  }

  collection = (item: any) => {
    if (item.checked) {
      // eslint-disable-next-line
      const data = Object.assign({}, this.state.selectMap, {
        [item.block_hash]: item
      })
      this.setState({
        selectMap: data
      })
    } else {
      // eslint-disable-next-line
      const data = Object.assign({}, this.state.selectMap)
      delete data[item.block_hash]
      this.setState({
        selectMap: data
      })
    }
  }

  fetchListPage = (page: number) => {
    this.props.getTransactionList({ page },()=>{
      this.setState({
        currentPage:page
      });
    });
  };

  pagination = (type: string) => {
    // transactions use timestamp as sort filed, so we can not jump to specific page
    // const hits = this.props.transactionList ? this.props.transactionList.contents : [];
    // const last = hits[hits.length - 1];
    // const after = last && last.sort || 0;
    if (type === 'prev' && this.state.currentPage > 1) {
      const page = this.state.currentPage - 1;
      this.props.navigate(`/main/transactions/${page}`);
      this.fetchListPage(page);
    } else if (type === 'next') {
      const page = this.state.currentPage + 1;
      this.props.navigate(`/main/transactions/${page}`);
      this.fetchListPage(page);
    }
  };

  handleDonwLoad = () => {
    const { params, t } = this.props;
    const arr = Object.entries(this.state.selectMap).map(ele => ele[1])
    let csvData = "";
    let csvTitle = "";
    const csvRowArr = []
    for (let i = 0; i < arr.length; i++) {
      const transaction = arr[i]
      const network = params.network;
      const source:any = transaction
      let payloadInHex = '';
      let sender = '';
      if (source.user_transaction && source.user_transaction.raw_txn) {
        payloadInHex = source.user_transaction.raw_txn.payload;
        sender = source.user_transaction.raw_txn.sender;
      }
      const txnPayload = payloadInHex
        ? encoding.decodeTransactionPayload(payloadInHex)
        : [];
      const type = Object.keys(txnPayload)[0];

      let args: any;
      let txn_type_args: any;
      let functionId: any;
      let moduleAddress: any;
      let moduleName: any;
      let functionName: any;

      if ('ScriptFunction' in txnPayload) {
        args = txnPayload.ScriptFunction.args;
        txn_type_args = txnPayload.ScriptFunction.ty_args;
        const func = txnPayload.ScriptFunction.func as {
          address: types.AccountAddress;
          module: types.Identifier;
          functionName: types.Identifier;
        };
        moduleAddress = func.address;
        moduleName = func.module;
        functionName = func.functionName;
        functionId = `${moduleAddress}::${moduleName}::${functionName}`;
      }
      if ('Package' in txnPayload) {
        if (txnPayload.Package.init_script) {
          args = txnPayload.Package.init_script.args;
          txn_type_args = txnPayload.Package.init_script.ty_args;
          const func = txnPayload.Package.init_script.func as {
            address: types.AccountAddress;
            module: types.Identifier;
            functionName: types.Identifier;
          };
          moduleAddress = func.address;
          moduleName = func.module;
          functionName = func.functionName;
          functionId = `${moduleAddress}::${moduleName}::${functionName}`;
        }
      }

      const savData = [
        [t('common.Hash'), source.transaction_hash],
        [t('transaction.Type'), type],
        [t('common.Time'),`${new Date(parseInt(source.timestamp, 10)).toLocaleString()} ${new Date().toTimeString().slice(9)}`],
        [t('transaction.BlockHash'),source.block_hash],
        [t('transaction.BlockHeight'),source.block_number],
        [t('transaction.StateRootHash'), source.state_root_hash],
        [t('transaction.Status'), source.status],
        [t('common.GasUsed'), source.gas_used],
        [t('transaction.Sender'), sender],
      ];

      const provider = new providers.JsonRpcProvider(
        `https://${network}-seed.starcoin.org`,
      );
      const getResolvedFunction = async () => {
        const data = await provider.send('contract.resolve_function', [functionId]);
        this.setState({ resolvedFunction: data });
      };
      const resolvedFunction = this.state?.resolvedFunction;
      if (!resolvedFunction){
        getResolvedFunction();
      }

      const decodedArgs = args ? args.map((arg: string, index: number) => {
        const type_tag = resolvedFunction?.args[index + 1]?.type_tag;
        return resolvedFunction?.args[index + 1]
          ? [types.formatTypeTag(type_tag),
            type_tag !== 'Address' ? formatArgsWithTypeTag(
              new bcs.BcsDeserializer(arrayify(arg)),
              resolvedFunction.args[index + 1].type_tag,
            ) : arg,
          ]
          : arg;
      }) : {};

      if (moduleAddress) {
        savData.push([t('transaction.FunctionModuleAddress'), moduleAddress]);
      }
      if (moduleName) {
        savData.push([t('transaction.FunctionModuleName'), moduleName]);
      }
      if (functionName) {
        savData.push([t('transaction.FunctionName'), functionName]);
      }
      if (txn_type_args) {
        savData.push([t('transaction.TxnTypeArgs'), JSON.stringify(txn_type_args[0] || [])]);
      }
      
      for (let i = 0; i < decodedArgs.length; i++) {
        if (decodedArgs[i][0] === 'address') {
          const address = decodedArgs[i][1];
          savData.push([`${t('transaction.arg')} ${i+1}`,address]);
        } else {
          savData.push([`${t('transaction.arg')} ${i+1}`, decodedArgs[i][1]]);
        }
      }
      let csvRow = ''
      if (!csvTitle) {
        for (let index = 0; index < savData.length; index++) {
          const element = savData[index];
          csvTitle += `"${element[0]}",`;
        }
      }
      for (let index = 0; index < savData.length; index++) {
        const element = savData[index];
        csvRow += `"${element[1]}",`;
      }
      csvRowArr.push(csvRow)
    }
    csvData = `${csvTitle}`
    
    csvRowArr.forEach(ele => {
      csvData += `\r\n${ele}`
    })
    const blob = new Blob([csvData], {type: "text/plain;charset=utf-8"});
    FileSaver.saveAs(blob, `${new Date()}.csv`);
  }
  
  render() {
    const { transactionList, isLoadingMore, className, classes, t } = this.props;
    const isInitialLoad = !transactionList;
    const transactions = transactionList && transactionList.contents || [];
    const transactionsList = transactions.length ? (
      <TransactionTable
        transactions={transactions}
      />
    ) : (
      <CenteredView>
        <div className={classes.header}>
          <Typography variant='h5' gutterBottom className={classes.title}>
            {t('transaction.NoTransactionData')}
          </Typography>
        </div>
      </CenteredView>
    );
    return (
      <div>
        <Helmet>
          <title>{t('header.transactions')}</title>
        </Helmet>
        <ListView
          className={className}
          title={
            <div className={classes.tit}>
              <div>{t('header.transactions')}</div>
              <div onClick={this.handleDonwLoad}>{t('header.downLoad')}</div>
            </div>
          }
          name={t('header.transactions')}
          pluralName={t('header.transactions')}
          content={
            <div>
              {isInitialLoad ? <Loading /> : transactionsList}
              <div className={classes.pagerArea}>
                <Pagination
                  page={this.state.currentPage}
                  pageSize={20}
                  currentPageSize={transactions == null ? null : transactions.length}
                  hasPreviousPage={this.state.currentPage > 1}
                  hasNextPage={!!true}
                  onPrevPage={() => this.pagination('prev')}
                  onNextPage={() => this.pagination('next')}
                  isLoading={isLoadingMore}
                />
              </div>
            </div>
          }
        />
      </div>
    );
  }
}

export default withStyles(useStyles)(withTranslation()(withRouter(Index)));
